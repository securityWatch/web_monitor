package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertService struct {
	db    *pgxpool.Pool
	email *EmailService
	http  *http.Client
}

func NewAlertService(db *pgxpool.Pool, email *EmailService) *AlertService {
	return &AlertService{
		db:    db,
		email: email,
		http:  &http.Client{Timeout: 15 * time.Second},
	}
}

type AlertPayload struct {
	Monitor   string `json:"monitor"`
	Status    string `json:"status"`
	Detail    string `json:"detail"`
	Timestamp string `json:"timestamp"`
	Event     string `json:"event"`
}

func (a *AlertService) NotifyStatusChange(ctx context.Context, orgID, monitorID, name, status, detail string) {
	if monitorID != "" && status == "down" {
		var suppressedUntil *time.Time
		_ = a.db.QueryRow(ctx, `SELECT flap_suppressed_until FROM monitors WHERE id = $1`, monitorID).Scan(&suppressedUntil)
		if suppressedUntil != nil && time.Now().Before(*suppressedUntil) {
			log.Printf("[FLAP] Skipping down alert for %s (suppressed until %s)", name, suppressedUntil.Format(time.RFC3339))
			return
		}
	}

	event := status
	if status == "up" {
		event = "recovery"
	}

	rows, err := a.db.Query(ctx, `
		SELECT ac.id, ac.type, ac.config
		FROM alert_rules ar
		JOIN alert_channels ac ON ac.id = ar.channel_id AND ac.enabled = true
		WHERE ar.org_id = $1 AND ar.enabled = true
		  AND (ar.monitor_id IS NULL OR ar.monitor_id = $2)
		  AND (
		    ar.event_type = 'all'
		    OR (ar.event_type = 'down' AND $3 IN ('down', 'ssl_warning'))
		    OR (ar.event_type = 'up' AND $3 = 'up')
		  )
	`, orgID, monitorID, status)
	if err != nil {
		log.Printf("alert rules query: %v", err)
		a.fallbackOwnerEmail(ctx, orgID, name, status, detail)
		return
	}
	defer rows.Close()

	payload := AlertPayload{
		Monitor:   name,
		Status:    strings.ToUpper(status),
		Detail:    detail,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Event:     event,
	}

	sentEmail := false
	for rows.Next() {
		var channelID, chType string
		var chConfig json.RawMessage
		if err := rows.Scan(&channelID, &chType, &chConfig); err != nil {
			continue
		}
		a.deliver(ctx, orgID, channelID, chType, chConfig, payload, &sentEmail)
	}

	if !sentEmail {
		a.fallbackOwnerEmail(ctx, orgID, name, status, detail)
	}
}

func (a *AlertService) fallbackOwnerEmail(ctx context.Context, orgID, name, status, detail string) {
	var email string
	_ = a.db.QueryRow(ctx, `
		SELECT u.email FROM users u
		JOIN organization_members om ON om.user_id = u.id AND om.role = 'owner'
		WHERE om.org_id = $1 AND u.notify_incidents = true LIMIT 1
	`, orgID).Scan(&email)
	if email != "" {
		_ = a.email.SendAlert(email, name, status, detail)
	}
}

func (a *AlertService) deliver(ctx context.Context, orgID, channelID, chType string, chConfig json.RawMessage, payload AlertPayload, sentEmail *bool) {
	if payload.Event != "recovery" && payload.Event != "test" {
		var recent int
		_ = a.db.QueryRow(ctx, `
			SELECT COUNT(*) FROM alert_deliveries
			WHERE org_id = $1 AND channel_id = $2 AND status = 'sent'
			  AND created_at > now() - interval '15 minutes'
			  AND payload::text ILIKE $3
		`, orgID, channelID, "%"+payload.Monitor+"%").Scan(&recent)
		if recent > 0 {
			return
		}
	}

	var cfg map[string]string
	_ = json.Unmarshal(chConfig, &cfg)

	deliveryStatus := "sent"
	var errMsg string

	switch chType {
	case "email":
		to := cfg["email"]
		if to == "" {
			_ = a.db.QueryRow(ctx, `
				SELECT u.email FROM users u
				JOIN organization_members om ON om.user_id = u.id
				WHERE om.org_id = $1 AND u.notify_incidents = true LIMIT 1
			`, orgID).Scan(&to)
		}
		if to != "" {
			if err := a.email.SendAlert(to, payload.Monitor, strings.ToLower(payload.Status), payload.Detail); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			} else {
				*sentEmail = true
			}
		}
	case "webhook":
		if url := cfg["url"]; url != "" {
			if err := a.postJSON(url, payload); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	case "slack":
		if url := cfg["url"]; url != "" {
			if err := a.postJSON(url, map[string]string{
				"text": fmt.Sprintf("*%s* is *%s*\n%s", payload.Monitor, payload.Status, payload.Detail),
			}); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	case "discord":
		if url := cfg["url"]; url != "" {
			if err := a.postJSON(url, map[string]string{
				"content": fmt.Sprintf("**%s** is **%s**\n%s", payload.Monitor, payload.Status, payload.Detail),
			}); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	case "pagerduty":
		routingKey := cfg["routingKey"]
		if routingKey == "" {
			routingKey = cfg["integrationKey"]
		}
		if routingKey != "" {
			if err := a.postPagerDuty(routingKey, payload); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	}

	payloadJSON, _ := json.Marshal(payload)
	if errMsg != "" {
		payloadJSON, _ = json.Marshal(map[string]string{"error": errMsg, "payload": string(payloadJSON)})
	}
	_, _ = a.db.Exec(ctx, `
		INSERT INTO alert_deliveries (id, org_id, channel_id, status, payload, sent_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, CASE WHEN $4 = 'sent' THEN now() ELSE NULL END)
	`, uuid.New().String(), orgID, channelID, deliveryStatus, string(payloadJSON))
}

func (a *AlertService) postPagerDuty(routingKey string, payload AlertPayload) error {
	severity := "error"
	if payload.Event == "recovery" {
		severity = "info"
	}
	body := map[string]interface{}{
		"routing_key": routingKey,
		"event_action": "trigger",
		"payload": map[string]interface{}{
			"summary":  fmt.Sprintf("%s is %s", payload.Monitor, payload.Status),
			"severity": severity,
			"source":   "pulsewatch",
			"custom_details": map[string]string{
				"detail": payload.Detail,
				"event":  payload.Event,
			},
		},
	}
	if payload.Event == "recovery" {
		body["event_action"] = "resolve"
	}
	return a.postJSON("https://events.pagerduty.com/v2/enqueue", body)
}

func (a *AlertService) postJSON(url string, body interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PulseWatch/1.0")

	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (a *AlertService) SendTest(ctx context.Context, orgID, channelID string) error {
	var chType string
	var chConfig json.RawMessage
	err := a.db.QueryRow(ctx, `
		SELECT type, config FROM alert_channels WHERE id = $1 AND org_id = $2 AND enabled = true
	`, channelID, orgID).Scan(&chType, &chConfig)
	if err != nil {
		return fmt.Errorf("channel not found")
	}
	sent := false
	a.deliver(ctx, orgID, channelID, chType, chConfig, AlertPayload{
		Monitor:   "PulseWatch Test",
		Status:    "TEST",
		Detail:    "This is a test alert from PulseWatch.",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Event:     "test",
	}, &sent)
	return nil
}

func (a *AlertService) NotifySSLWarning(ctx context.Context, orgID, name string, daysLeft int) {
	detail := fmt.Sprintf("SSL certificate expires in %d days", daysLeft)
	a.NotifyStatusChange(ctx, orgID, "", name, "ssl_warning", detail)
}
