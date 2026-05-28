package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
)

type Scheduler struct {
	db     *pgxpool.Pool
	cfg    *config.Config
	email  *EmailService
	alerts *AlertService
	stop   chan struct{}
}

func NewScheduler(db *pgxpool.Pool, cfg *config.Config, email *EmailService, alerts *AlertService) *Scheduler {
	return &Scheduler{db: db, cfg: cfg, email: email, alerts: alerts, stop: make(chan struct{})}
}

func (s *Scheduler) Start() {
	go s.loop()
	log.Println("Monitor scheduler started")
}

func (s *Scheduler) Stop() {
	close(s.stop)
}

func (s *Scheduler) loop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			s.tick(context.Background())
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	rows, err := s.db.Query(ctx, `
		SELECT m.id, m.org_id, m.name, m.type, m.target_url, m.interval_seconds, m.status, m.config,
		       o.plan_tier
		FROM monitors m
		JOIN organizations o ON o.id = m.org_id
		WHERE m.status != 'paused' AND m.next_run_at <= now()
		ORDER BY m.next_run_at
		LIMIT 50
	`)
	if err != nil {
		log.Printf("scheduler query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, orgID, name, mType, target, planTier string
		var interval int
		var status string
		var config json.RawMessage
		if err := rows.Scan(&id, &orgID, &name, &mType, &target, &interval, &status, &config, &planTier); err != nil {
			continue
		}
		s.runCheck(ctx, id, orgID, name, mType, target, interval, status, config, planTier)
	}
}

func (s *Scheduler) runCheck(ctx context.Context, id, orgID, name, mType, target string, interval int, prevStatus string, config json.RawMessage, planTier string) {
	outcome := RunCheck(ctx, mType, target, config)
	metaJSON, _ := json.Marshal(outcome.Metadata)

	newStatus := "up"
	if !outcome.IsUp {
		newStatus = "down"
	}

	checkID := uuid.New().String()
	now := time.Now().UTC()
	var errMsg *string
	if outcome.ErrorMessage != "" {
		errMsg = &outcome.ErrorMessage
	}

	_, err := s.db.Exec(ctx, `
		INSERT INTO check_results (id, org_id, monitor_id, checked_at, region, status_code, response_ms, is_up, error_message, metadata)
		VALUES ($1, $2, $3, $4, 'us-east', $5, $6, $7, $8, $9::jsonb)
	`, checkID, orgID, id, now, outcome.StatusCode, outcome.ResponseMs, outcome.IsUp, errMsg, string(metaJSON))
	if err != nil {
		log.Printf("insert check result: %v", err)
	}

	nextRun := now.Add(time.Duration(interval) * time.Second)
	_, _ = s.db.Exec(ctx, `
		UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
		       next_run_at = $4, updated_at = $2
		WHERE id = $5
	`, newStatus, now, outcome.ResponseMs, nextRun, id)

	if prevStatus != newStatus && prevStatus != "pending" {
		s.handleStatusChange(ctx, id, orgID, name, prevStatus, newStatus, outcome.ErrorMessage)
	} else if prevStatus == "pending" && newStatus == "down" {
		s.handleStatusChange(ctx, id, orgID, name, "up", newStatus, outcome.ErrorMessage)
	}

	// SSL expiry anomaly
	if sslDays, ok := outcome.Metadata["sslDaysLeft"].(int); ok && sslDays <= 30 {
		s.alerts.NotifySSLWarning(ctx, orgID, name, sslDays)
	}

	// Response time spike vs 7-day avg
	s.checkResponseAnomaly(ctx, id, orgID, name, outcome.ResponseMs)
}

func (s *Scheduler) handleStatusChange(ctx context.Context, monitorID, orgID, name, from, to, detail string) {
	if to == "down" {
		var incidentID string
		err := s.db.QueryRow(ctx, `
			INSERT INTO incidents (id, org_id, monitor_id, started_at, status, severity, message)
			VALUES ($1, $2, $3, now(), 'open', 'critical', $4)
			RETURNING id
		`, uuid.New().String(), orgID, monitorID, detail).Scan(&incidentID)
		if err != nil {
			log.Printf("create incident: %v", err)
		}
		s.alerts.NotifyStatusChange(ctx, orgID, monitorID, name, "down", detail)
	} else if to == "up" {
		_, _ = s.db.Exec(ctx, `
			UPDATE incidents SET status = 'resolved', resolved_at = now()
			WHERE monitor_id = $1 AND status = 'open'
		`, monitorID)
		s.alerts.NotifyStatusChange(ctx, orgID, monitorID, name, "up", "Monitor recovered")
	}
}

func (s *Scheduler) checkResponseAnomaly(ctx context.Context, monitorID, orgID, name string, currentMs int) {
	var avgMs *float64
	err := s.db.QueryRow(ctx, `
		SELECT AVG(response_ms)::float FROM check_results
		WHERE monitor_id = $1 AND checked_at > now() - interval '7 days' AND is_up = true
	`, monitorID).Scan(&avgMs)
	if err != nil || avgMs == nil || *avgMs == 0 {
		return
	}
	if float64(currentMs) > *avgMs*1.5 && float64(currentMs) > 500 {
		log.Printf("[ANOMALY] Response time spike on %s: %dms vs 7d avg %.0fms", name, currentMs, *avgMs)
	}
}

type AlertService struct {
	db    *pgxpool.Pool
	email *EmailService
}

func NewAlertService(db *pgxpool.Pool, email *EmailService) *AlertService {
	return &AlertService{db: db, email: email}
}

func (a *AlertService) NotifyStatusChange(ctx context.Context, orgID, monitorID, name, status, detail string) {
	rows, err := a.db.Query(ctx, `
		SELECT ac.type, ac.config, u.email
		FROM alert_rules ar
		JOIN alert_channels ac ON ac.id = ar.channel_id AND ac.enabled = true
		JOIN organization_members om ON om.org_id = ar.org_id
		JOIN users u ON u.id = om.user_id AND u.notify_incidents = true
		WHERE ar.org_id = $1 AND (ar.monitor_id IS NULL OR ar.monitor_id = $2)
		  AND ar.enabled = true AND ar.event_type IN ('down', 'up', 'all')
		LIMIT 10
	`, orgID, monitorID)
	if err != nil {
		// Fallback: org owner email
		var email string
		_ = a.db.QueryRow(ctx, `
			SELECT u.email FROM users u
			JOIN organization_members om ON om.user_id = u.id AND om.role = 'owner'
			WHERE om.org_id = $1 LIMIT 1
		`, orgID).Scan(&email)
		if email != "" {
			_ = a.email.SendAlert(email, name, status, detail)
		}
		return
	}
	defer rows.Close()

	sent := make(map[string]bool)
	for rows.Next() {
		var chType string
		var chConfig json.RawMessage
		var userEmail string
		if err := rows.Scan(&chType, &chConfig, &userEmail); err != nil {
			continue
		}
		switch chType {
		case "email":
			if !sent[userEmail] {
				_ = a.email.SendAlert(userEmail, name, status, detail)
				sent[userEmail] = true
			}
		case "webhook":
			var cfg map[string]string
			_ = json.Unmarshal(chConfig, &cfg)
			if url, ok := cfg["url"]; ok && url != "" {
				go postWebhook(url, name, status, detail)
			}
		}
	}

	if len(sent) == 0 {
		var email string
		_ = a.db.QueryRow(ctx, `
			SELECT u.email FROM users u
			JOIN organization_members om ON om.user_id = u.id AND om.role = 'owner'
			WHERE om.org_id = $1 LIMIT 1
		`, orgID).Scan(&email)
		if email != "" {
			_ = a.email.SendAlert(email, name, status, detail)
		}
	}
}

func (a *AlertService) NotifySSLWarning(ctx context.Context, orgID, name string, daysLeft int) {
	var email string
	_ = a.db.QueryRow(ctx, `
		SELECT u.email FROM users u
		JOIN organization_members om ON om.user_id = u.id
		WHERE om.org_id = $1 AND u.notify_ssl = true LIMIT 1
	`, orgID).Scan(&email)
	if email != "" {
		detail := fmt.Sprintf("SSL certificate expires in %d days", daysLeft)
		_ = a.email.SendAlert(email, name, "ssl_warning", detail)
	}
}

func postWebhook(url, name, status, detail string) {
	payload := fmt.Sprintf(`{"monitor":"%s","status":"%s","detail":%q}`, name, status, detail)
	// Simple POST - use http in production
	log.Printf("[WEBHOOK] POST %s: %s", url, payload)
}
