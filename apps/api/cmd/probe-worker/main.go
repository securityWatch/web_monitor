package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pulsewatch/api/internal/services"
)

func main() {
	apiURL := env("PROBE_API_URL", "http://127.0.0.1:4000")
	secret := env("PROBE_SECRET", "")
	region := env("PROBE_REGION", "us-east")
	workerID := env("PROBE_WORKER_ID", fmt.Sprintf("%s-%d", region, os.Getpid()))

	if secret == "" {
		log.Fatal("PROBE_SECRET required")
	}
	log.Printf("Probe worker %s region=%s api=%s", workerID, region, apiURL)

	client := &http.Client{Timeout: 120 * time.Second}
	for {
		task, err := claim(client, apiURL, secret, region, workerID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if task == nil {
			time.Sleep(2 * time.Second)
			continue
		}
		result := runCheck(task)
		if err := complete(client, apiURL, secret, task.TaskID, result); err != nil {
			log.Printf("complete error: %v", err)
		}
	}
}

func claim(client *http.Client, apiURL, secret, region, workerID string) (*services.ProbeTaskClaim, error) {
	req, _ := http.NewRequest(http.MethodPost, apiURL+"/api/internal/probe/claim?region="+region, nil)
	req.Header.Set("X-Probe-Secret", secret)
	req.Header.Set("X-Worker-Id", workerID)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("claim %d: %s", resp.StatusCode, string(b))
	}
	var task services.ProbeTaskClaim
	if err := json.NewDecoder(resp.Body).Decode(&task); err != nil {
		return nil, err
	}
	return &task, nil
}

func complete(client *http.Client, apiURL, secret, taskID string, result services.ProbeTaskResult) error {
	body, _ := json.Marshal(map[string]interface{}{
		"taskId": taskID,
		"result": result,
	})
	req, _ := http.NewRequest(http.MethodPost, apiURL+"/api/internal/probe/complete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Probe-Secret", secret)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("complete %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func runCheck(task *services.ProbeTaskClaim) services.ProbeTaskResult {
	ctx := context.Background()
	p := task.Payload
	outcome := services.RunCheck(ctx, p.Type, p.Target, p.Config)
	for attempt := 1; attempt < 3 && !outcome.IsUp; attempt++ {
		time.Sleep(5 * time.Second)
		retry := services.RunCheck(ctx, p.Type, p.Target, p.Config)
		if retry.IsUp {
			outcome = retry
			break
		}
		outcome = retry
	}
	return services.ProbeTaskResult{
		IsUp:         outcome.IsUp,
		StatusCode:   outcome.StatusCode,
		ResponseMs:   outcome.ResponseMs,
		ErrorMessage: outcome.ErrorMessage,
		Metadata:     outcome.Metadata,
	}
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
