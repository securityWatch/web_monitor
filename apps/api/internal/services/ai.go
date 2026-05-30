package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	deepSeekDefaultBaseURL = "https://api.deepseek.com"
	deepSeekDefaultModel   = "deepseek-chat"
)

func deepSeekConfigured() bool {
	return strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")) != ""
}

func deepSeekModel() string {
	model := strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL"))
	if model == "" {
		return deepSeekDefaultModel
	}
	return model
}

func callDeepSeekJSON(ctx context.Context, systemPrompt, userPrompt string, out interface{}) error {
	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" {
		return errors.New("DeepSeek API key not configured")
	}
	model := deepSeekModel()
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("DEEPSEEK_API_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = deepSeekDefaultBaseURL
	}

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.2,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 25 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("DeepSeek API returned HTTP %d", resp.StatusCode)
	}
	var envelope struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return err
	}
	if len(envelope.Choices) == 0 || strings.TrimSpace(envelope.Choices[0].Message.Content) == "" {
		return errors.New("DeepSeek API returned empty content")
	}
	return json.Unmarshal([]byte(stripJSONCodeFence(envelope.Choices[0].Message.Content)), out)
}

func stripJSONCodeFence(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

type AIIncidentSummary struct {
	Summary        string   `json:"summary"`
	Impact         string   `json:"impact"`
	LikelyCause    string   `json:"likelyCause"`
	ActionItems    []string `json:"actionItems"`
	CustomerUpdate string   `json:"customerUpdate"`
}

type AIAlertExplanation struct {
	Summary     string   `json:"summary"`
	LikelyCause string   `json:"likelyCause"`
	NextSteps   []string `json:"nextSteps"`
	Severity    string   `json:"severity"`
}

type AIMonitorDraft struct {
	Name            string                 `json:"name"`
	Type            string                 `json:"type"`
	TargetURL       string                 `json:"targetUrl"`
	IntervalSeconds int                    `json:"intervalSeconds"`
	Config          map[string]interface{} `json:"config"`
	Regions         []string               `json:"regions"`
	Explanation     string                 `json:"explanation"`
}

type AISecurityReport struct {
	Headline      string   `json:"headline"`
	Summary       string   `json:"summary"`
	Risks         []string `json:"risks"`
	Wins          []string `json:"wins"`
	NextActions   []string `json:"nextActions"`
	CustomerBrief string   `json:"customerBrief"`
}

type AIVisualExplanation struct {
	Summary     string   `json:"summary"`
	VisualRisk  string   `json:"visualRisk"`
	Evidence    []string `json:"evidence"`
	NextActions []string `json:"nextActions"`
}

func GenerateAIIncidentSummary(ctx context.Context, input string) (AIIncidentSummary, error) {
	var out AIIncidentSummary
	err := callDeepSeekJSON(ctx,
		"Return concise incident postmortem JSON with keys summary, impact, likelyCause, actionItems(array), customerUpdate. Use Chinese when input is Chinese.",
		input,
		&out,
	)
	return out, err
}

func ExplainAlertWithAI(ctx context.Context, monitor, status, detail string) (AIAlertExplanation, error) {
	var out AIAlertExplanation
	err := callDeepSeekJSON(ctx,
		"Return JSON keys summary, likelyCause, nextSteps(array), severity(low|medium|high|critical). Be concise and operational.",
		fmt.Sprintf("Monitor: %s\nStatus/event: %s\nDetail: %s", monitor, status, detail),
		&out,
	)
	return out, err
}

func BuildMonitorDraftWithAI(ctx context.Context, prompt string) (AIMonitorDraft, error) {
	var out AIMonitorDraft
	err := callDeepSeekJSON(ctx,
		"Create a PulseWatch monitor draft. Return JSON keys name,type,targetUrl,intervalSeconds,config,regions,explanation. type must be one of http,tcp,ping,keyword,ssl,dns,domain,pagespeed,tamper,heartbeat. Use config JSON compatible with PulseWatch.",
		prompt,
		&out,
	)
	if out.IntervalSeconds <= 0 {
		out.IntervalSeconds = 300
	}
	if len(out.Regions) == 0 {
		out.Regions = []string{"us-east", "eu-west"}
	}
	if out.Config == nil {
		out.Config = map[string]interface{}{}
	}
	return out, err
}

func GenerateAISecurityReport(ctx context.Context, input string) (AISecurityReport, error) {
	var out AISecurityReport
	err := callDeepSeekJSON(ctx,
		"Return weekly reliability/security report JSON with keys headline, summary, risks(array), wins(array), nextActions(array), customerBrief. Keep it executive-friendly.",
		input,
		&out,
	)
	return out, err
}

func ExplainVisualTamperWithAI(ctx context.Context, input string) (AIVisualExplanation, error) {
	var out AIVisualExplanation
	err := callDeepSeekJSON(ctx,
		"Return JSON keys summary, visualRisk(none|low|medium|high), evidence(array), nextActions(array). Explain screenshot/artifact and tamper metadata as a visual/content integrity analyst.",
		input,
		&out,
	)
	return out, err
}
