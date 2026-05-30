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
	db        *pgxpool.Pool
	cfg       *config.Config
	email     *EmailService
	alerts    *AlertService
	incidents *IncidentService
	probes    *ProbeDispatch
	security  *SecurityEvents
	stop      chan struct{}
}

func NewScheduler(db *pgxpool.Pool, cfg *config.Config, email *EmailService, alerts *AlertService, incidents *IncidentService) *Scheduler {
	s := &Scheduler{db: db, cfg: cfg, email: email, alerts: alerts, incidents: incidents, probes: NewProbeDispatch(db), stop: make(chan struct{})}
	s.security = NewSecurityEvents(db, alerts, incidents)
	return s
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
			ctx := context.Background()
			s.tick(ctx)
			if s.cfg.ProbeDispatch {
				s.probes.AggregatePending(ctx, s)
			}
			s.processPendingAlerts(ctx)
			s.processOnCallEscalation(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	rows, err := s.db.Query(ctx, `
		SELECT m.id, m.org_id, m.name, m.type, m.target_url, m.interval_seconds, m.status, m.config,
		       m.regions, m.last_heartbeat_at, o.plan_tier
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
		var regions json.RawMessage
		var lastHB *time.Time
		if err := rows.Scan(&id, &orgID, &name, &mType, &target, &interval, &status, &config, &regions, &lastHB, &planTier); err != nil {
			continue
		}
		if IsInMaintenance(ctx, s.db, orgID, id) {
			nextRun := time.Now().UTC().Add(time.Duration(interval) * time.Second)
			_, _ = s.db.Exec(ctx, `UPDATE monitors SET next_run_at = $1, updated_at = now() WHERE id = $2`, nextRun, id)
			continue
		}
		if s.cfg.ProbeDispatch && mType != "heartbeat" {
			nextRun := time.Now().UTC().Add(time.Duration(interval) * time.Second)
			if err := s.probes.EnqueueRun(ctx, id, orgID, name, mType, target, interval, status, config, regions, lastHB, planTier); err != nil {
				log.Printf("probe enqueue: %v", err)
			} else {
				_, _ = s.db.Exec(ctx, `UPDATE monitors SET next_run_at = $1, updated_at = now() WHERE id = $2`, nextRun, id)
			}
			continue
		}
		s.runCheck(ctx, id, orgID, name, mType, target, interval, status, config, regions, lastHB, planTier)
	}
}

func (s *Scheduler) runCheck(ctx context.Context, id, orgID, name, mType, target string, interval int, prevStatus string, config json.RawMessage, regions json.RawMessage, lastHB *time.Time, planTier string) {
	start := time.Now()
	regionList := ParseRegions(regions)
	if len(regionList) == 0 {
		regionList = []string{"us-east"}
	}

	type regionResult struct {
		region  string
		outcome CheckOutcome
	}
	results := make([]regionResult, 0, len(regionList))
	failCount := 0

	for _, region := range regionList {
		var outcome CheckOutcome
		if mType == "heartbeat" {
			outcome = RunHeartbeatCheck(ctx, s.db, id, interval, lastHB, start)
		} else {
			outcome = RunCheck(ctx, mType, target, config)
			for attempt := 1; attempt < 3 && !outcome.IsUp; attempt++ {
				time.Sleep(5 * time.Second)
				retry := RunCheck(ctx, mType, target, config)
				if retry.IsUp {
					outcome = retry
					break
				}
				outcome = retry
			}
		}
		if !outcome.IsUp {
			failCount++
		}
		results = append(results, regionResult{region: region, outcome: outcome})
	}

	quorum := len(regionList)/2 + 1
	aggregateUp := failCount < quorum
	primary := results[0].outcome
	if !aggregateUp {
		for _, r := range results {
			if !r.outcome.IsUp {
				primary = r.outcome
				break
			}
		}
	}
	outcome := primary
	outcome.IsUp = aggregateUp
	if !aggregateUp && outcome.ErrorMessage == "" {
		outcome.ErrorMessage = fmt.Sprintf("%d/%d regions down", failCount, len(regionList))
	}
	metaJSON, _ := json.Marshal(outcome.Metadata)
	now := time.Now().UTC()

	for _, r := range results {
		checkID := uuid.New().String()
		var errMsg *string
		if r.outcome.ErrorMessage != "" {
			errMsg = &r.outcome.ErrorMessage
		}
		regMeta, _ := json.Marshal(r.outcome.Metadata)
		_, err := s.db.Exec(ctx, `
			INSERT INTO check_results (id, org_id, monitor_id, checked_at, region, status_code, response_ms, is_up, error_message, metadata)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
		`, checkID, orgID, id, now, r.region, r.outcome.StatusCode, r.outcome.ResponseMs, r.outcome.IsUp, errMsg, string(regMeta))
		if err != nil {
			log.Printf("insert check result: %v", err)
		}
	}
	_ = metaJSON

	newStatus := "up"
	if !outcome.IsUp {
		newStatus = "down"
	}

	nextRun := now.Add(time.Duration(interval) * time.Second)
	if newStatus == "down" && prevStatus != "down" {
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, pending_down_at = $2, updated_at = $2
			WHERE id = $5
		`, newStatus, now, outcome.ResponseMs, nextRun, id)
	} else if newStatus == "up" {
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, pending_down_at = NULL, updated_at = $2
			WHERE id = $5
		`, newStatus, now, outcome.ResponseMs, nextRun, id)
	} else {
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, updated_at = $2
			WHERE id = $5
		`, newStatus, now, outcome.ResponseMs, nextRun, id)
	}

	if newStatus == "up" && (prevStatus == "down" || prevStatus == "pending") {
		s.handleRecovery(ctx, id, orgID, name)
	} else if prevStatus == "pending" && newStatus == "down" {
		// first check still down — pending_down_at already set
	}

	s.security.AfterCheck(ctx, id, orgID, name, mType, config, outcome)

	s.checkResponseAnomaly(ctx, id, orgID, name, outcome.ResponseMs)
}

func (s *Scheduler) processPendingAlerts(ctx context.Context) {
	rows, err := s.db.Query(ctx, `
		SELECT m.id, m.org_id, m.name, m.pending_down_at
		FROM monitors m
		WHERE m.status = 'down' AND m.pending_down_at IS NOT NULL
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, orgID, name string
		var pendingAt time.Time
		if err := rows.Scan(&id, &orgID, &name, &pendingAt); err != nil {
			continue
		}
		if IsInMaintenance(ctx, s.db, orgID, id) {
			continue
		}
		delay := MaxAlertDelayMinutes(ctx, s.db, orgID, id)
		if time.Since(pendingAt) < time.Duration(delay)*time.Minute {
			continue
		}
		var openCount int
		_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM incidents WHERE monitor_id = $1 AND status = 'open'`, id).Scan(&openCount)
		if openCount > 0 {
			_, _ = s.db.Exec(ctx, `UPDATE monitors SET pending_down_at = NULL WHERE id = $1`, id)
			continue
		}
		s.fireDownAlert(ctx, id, orgID, name, "Monitor is down")
	}
}

func (s *Scheduler) fireDownAlert(ctx context.Context, monitorID, orgID, name, detail string) {
	if s.isFlapping(ctx, monitorID) {
		_, _ = s.db.Exec(ctx, `UPDATE monitors SET flap_suppressed_until = now() + interval '15 minutes' WHERE id = $1`, monitorID)
		log.Printf("[FLAP] Suppressing alerts for %s due to flapping", name)
		return
	}
	incidentID, merged, err := s.incidents.CreateOrMerge(ctx, orgID, monitorID, name, detail)
	if err != nil {
		log.Printf("create incident: %v", err)
		return
	}
	_, _ = s.db.Exec(ctx, `UPDATE monitors SET pending_down_at = NULL WHERE id = $1`, monitorID)
	if !merged {
		s.incidents.SyncStatusPage(ctx, orgID, incidentID, name+" — service disruption")
		s.alerts.CreateOnCallAlert(ctx, orgID, incidentID)
		s.alerts.NotifyStatusChange(ctx, orgID, monitorID, name, "down", detail)
		var planTier, target, mType string
		_ = s.db.QueryRow(ctx, `SELECT o.plan_tier, m.target_url, m.type FROM monitors m JOIN organizations o ON o.id = m.org_id WHERE m.id = $1`, monitorID).Scan(&planTier, &target, &mType)
		if mType == "http" || mType == "keyword" {
			go NewScreenshotService(s.db, s.cfg).CaptureOnDown(context.Background(), orgID, monitorID, "", target, detail, planTier)
		}
	}
}

func (s *Scheduler) handleRecovery(ctx context.Context, monitorID, orgID, name string) {
	if IsInMaintenance(ctx, s.db, orgID, monitorID) {
		return
	}
	var suppressedUntil *time.Time
	_ = s.db.QueryRow(ctx, `SELECT flap_suppressed_until FROM monitors WHERE id = $1`, monitorID).Scan(&suppressedUntil)
	if suppressedUntil != nil && time.Now().Before(*suppressedUntil) {
		return
	}
	s.incidents.ResolveByMonitor(ctx, monitorID)
	s.alerts.NotifyStatusChange(ctx, orgID, monitorID, name, "up", "Monitor recovered")
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

func (s *Scheduler) isFlapping(ctx context.Context, monitorID string) bool {
	rows, err := s.db.Query(ctx, `
		SELECT is_up FROM check_results
		WHERE monitor_id = $1 AND checked_at > now() - interval '5 minutes'
		ORDER BY checked_at
	`, monitorID)
	if err != nil {
		return false
	}
	defer rows.Close()
	var prev *bool
	changes := 0
	for rows.Next() {
		var up bool
		if err := rows.Scan(&up); err != nil {
			continue
		}
		if prev != nil && *prev != up {
			changes++
		}
		prev = &up
	}
	return changes > 4
}
