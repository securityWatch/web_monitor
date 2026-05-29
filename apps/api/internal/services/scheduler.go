package services

import (
	"context"
	"encoding/json"
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
	for attempt := 1; attempt < 3 && !outcome.IsUp; attempt++ {
		time.Sleep(5 * time.Second)
		retry := RunCheck(ctx, mType, target, config)
		if retry.IsUp {
			outcome = retry
			break
		}
		outcome = retry
	}
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
