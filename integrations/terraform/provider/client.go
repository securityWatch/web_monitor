package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// Minimal PulseWatch API client for Terraform provider v0.1
type Client struct {
	BaseURL string
	Token   string
	OrgID   string
	HTTP    *http.Client
}

func NewClient(baseURL, token, orgID string) *Client {
	return &Client{BaseURL: baseURL, Token: token, OrgID: orgID, HTTP: http.DefaultClient}
}

type MonitorCreate struct {
	Name            string   `json:"name"`
	Type            string   `json:"type"`
	TargetURL       string   `json:"targetUrl"`
	IntervalSeconds int      `json:"intervalSeconds"`
	Regions         []string `json:"regions"`
}

func (c *Client) CreateMonitor(ctx context.Context, m MonitorCreate) (string, error) {
	body, _ := json.Marshal(m)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/api/v1/orgs/%s/monitors", c.BaseURL, c.OrgID), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("create monitor %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return "", err
	}
	return out.ID, nil
}

func (c *Client) DeleteMonitor(ctx context.Context, id string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete,
		fmt.Sprintf("%s/api/v1/orgs/%s/monitors/%s", c.BaseURL, c.OrgID, id), nil)
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func main() {
	// CLI smoke test: PULSEWATCH_API_URL PULSEWATCH_API_KEY PULSEWATCH_ORG_ID
	c := NewClient(os.Getenv("PULSEWATCH_API_URL"), os.Getenv("PULSEWATCH_API_KEY"), os.Getenv("PULSEWATCH_ORG_ID"))
	id, err := c.CreateMonitor(context.Background(), MonitorCreate{
		Name: "TF Test", Type: "http", TargetURL: "https://example.com",
		IntervalSeconds: 300, Regions: []string{"us-east"},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("created", id)
	_ = c.DeleteMonitor(context.Background(), id)
}
