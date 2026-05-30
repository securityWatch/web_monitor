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
	db     *pgxpool.Pool
	email  *EmailService
	twilio *TwilioService
	oncall *OnCallService
	http   *http.Client
}

func NewAlertService(db *pgxpool.Pool, email *EmailService, twilio *TwilioService, oncall *OnCallService) *AlertService {
	return &AlertService{
		db:     db,
		email:  email,
		twilio: twilio,
		oncall: oncall,
		http:   &http.Client{Timeout: 15 * time.Second},
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

	webhookEnabled := true
	if monitorID != "" {
		var cfg json.RawMessage
		if err := a.db.QueryRow(ctx, `SELECT config FROM monitors WHERE id = $1`, monitorID).Scan(&cfg); err == nil {
			webhookEnabled = MonitorWebhookAlertsEnabled(cfg)
		}
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
		if chType == "webhook" && !webhookEnabled {
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
	case "teams":
		if url := cfg["url"]; url != "" {
			color := "E81123"
			if payload.Event == "recovery" {
				color = "2DC72D"
			}
			card := map[string]interface{}{
				"@type":      "MessageCard",
				"@context":   "https://schema.org/extensions",
				"summary":    fmt.Sprintf("%s is %s", payload.Monitor, payload.Status),
				"themeColor": color,
				"sections": []map[string]interface{}{{
					"activityTitle": fmt.Sprintf("**%s** is **%s**", payload.Monitor, payload.Status),
					"facts": []map[string]string{
						{"name": "Detail", "value": payload.Detail},
						{"name": "Time", "value": payload.Timestamp},
					},
				}},
			}
			if err := a.postJSON(url, card); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	case "dingtalk":
		cnCfg := parseCNChannelConfig(chConfig)
		if err := a.deliverDingTalk(cnCfg, payload); err != nil {
			deliveryStatus = "failed"
			errMsg = err.Error()
		}
	case "feishu":
		cnCfg := parseCNChannelConfig(chConfig)
		if err := a.deliverFeishu(cnCfg, payload); err != nil {
			deliveryStatus = "failed"
			errMsg = err.Error()
		}
	case "wecom":
		cnCfg := parseCNChannelConfig(chConfig)
		if err := a.deliverWeCom(cnCfg, payload); err != nil {
			deliveryStatus = "failed"
			errMsg = err.Error()
		}
	case "sms":
		phone := cfg["phone"]
		if phone == "" && a.oncall != nil {
			if oc := a.oncall.CurrentOnCall(ctx, orgID, 1); oc != nil && oc.Phone != "" {
				phone = oc.Phone
			}
		}
		if phone != "" && a.twilio != nil && a.twilio.Enabled() {
			if err := a.sendSMS(ctx, orgID, phone, fmt.Sprintf("[PulseWatch] %s is %s — %s", payload.Monitor, payload.Status, payload.Detail)); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		} else if phone != "" {
			deliveryStatus = "failed"
			errMsg = "SMS not configured (set TWILIO_* env)"
		}
	case "voice":
		phone := cfg["phone"]
		if phone != "" && a.twilio != nil && a.twilio.Enabled() {
			var tier string
			_ = a.db.QueryRow(ctx, `SELECT plan_tier FROM organizations WHERE id = $1`, orgID).Scan(&tier)
			if tier != "business" {
				deliveryStatus = "failed"
				errMsg = "voice alerts require Business plan"
				break
			}
			var recent int
			_ = a.db.QueryRow(ctx, `
				SELECT COUNT(*) FROM alert_deliveries ad
				JOIN alert_channels ac ON ac.id = ad.channel_id
				WHERE ad.org_id = $1 AND ac.type = 'voice' AND ad.status = 'sent'
				  AND ad.created_at > now() - interval '15 minutes'
			`, orgID).Scan(&recent)
			if recent > 0 {
				break
			}
			tts := fmt.Sprintf("PulseWatch alert. %s is %s.", payload.Monitor, payload.Status)
			if err := a.twilio.SendVoice(phone, tts); err != nil {
				deliveryStatus = "failed"
				errMsg = err.Error()
			}
		}
	case "opsgenie":
		if key := cfg["apiKey"]; key != "" {
			if err := a.postOpsgenie(key, payload); err != nil {
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

func (a *AlertService) NotifyOnCallEscalation(ctx context.Context, orgID, email, phone, msg string) {
	if phone != "" && a.twilio != nil && a.twilio.Enabled() {
		_ = a.sendSMS(ctx, orgID, phone, msg)
	}
	if email != "" {
		_ = a.email.SendAlert(email, "On-call escalation", "escalation", msg)
	}
}

func (a *AlertService) CreateOnCallAlert(ctx context.Context, orgID, incidentID string) {
	var scheduleID string
	err := a.db.QueryRow(ctx, `
		SELECT id FROM on_call_schedules WHERE org_id = $1 AND enabled = true ORDER BY created_at LIMIT 1
	`, orgID).Scan(&scheduleID)
	if err != nil {
		return
	}
	var userID *string
	if a.oncall != nil {
		if oc := a.oncall.CurrentOnCall(ctx, orgID, 1); oc != nil {
			userID = &oc.UserID
		}
	}
	_, _ = a.db.Exec(ctx, `
		INSERT INTO on_call_alerts (id, org_id, incident_id, schedule_id, user_id, escalation_level)
		VALUES ($1, $2, $3, $4, $5, 1)
	`, uuid.New().String(), orgID, incidentID, scheduleID, userID)
}

func (a *AlertService) postPagerDuty(routingKey string, payload AlertPayload) error {
	severity := "error"
	if payload.Event == "recovery" {
		severity = "info"
	}
	body := map[string]interface{}{
		"routing_key":  routingKey,
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

func (a *AlertService) postOpsgenie(apiKey string, payload AlertPayload) error {
	priority := "P3"
	if payload.Event != "recovery" {
		priority = "P2"
	}
	body := map[string]interface{}{
		"message":     fmt.Sprintf("%s is %s", payload.Monitor, payload.Status),
		"description": payload.Detail,
		"priority":    priority,
		"source":      "PulseWatch",
		"tags":        []string{"pulsewatch"},
	}
	if payload.Event == "recovery" {
		body["message"] = fmt.Sprintf("%s recovered", payload.Monitor)
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.opsgenie.com/v2/alerts", bytes.NewReader(mustJSON(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "GenieKey "+apiKey)
	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("opsgenie error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func (a *AlertService) sendSMS(ctx context.Context, orgID, phone, body string) error {
	month := time.Now().UTC().Format("2006-01-02")[:7] + "-01"
	var count int
	_ = a.db.QueryRow(ctx, `SELECT sms_count FROM sms_usage WHERE org_id = $1 AND month = $2::date`, orgID, month).Scan(&count)
	if count >= 500 {
		return fmt.Errorf("sms quota exceeded")
	}
	if err := a.twilio.SendSMS(phone, body); err != nil {
		return err
	}
	_, _ = a.db.Exec(ctx, `
		INSERT INTO sms_usage (id, org_id, month, sms_count) VALUES ($1, $2, $3::date, 1)
		ON CONFLICT (org_id, month) DO UPDATE SET sms_count = sms_usage.sms_count + 1
	`, uuid.New().String(), orgID, month)
	return nil
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
