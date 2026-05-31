package services

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProbeDispatch struct {
	db *pgxpool.Pool
}

func NewProbeDispatch(db *pgxpool.Pool) *ProbeDispatch {
	return &ProbeDispatch{db: db}
}

type ProbeRunPayload struct {
	RunID            string          `json:"runId"`
	MonitorID        string          `json:"monitorId"`
	OrgID            string          `json:"orgId"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	Target           string          `json:"targetUrl"`
	Config           json.RawMessage `json:"config"`
	LastHeartbeatAt  *time.Time      `json:"lastHeartbeatAt,omitempty"`
	IntervalSeconds  int             `json:"intervalSeconds"`
}

type ProbeTaskClaim struct {
	TaskID  string          `json:"taskId"`
	RunID   string          `json:"runId"`
	Region  string          `json:"region"`
	Payload ProbeRunPayload `json:"payload"`
}

type ProbeTaskResult struct {
	IsUp         bool                   `json:"isUp"`
	StatusCode   *int                   `json:"statusCode,omitempty"`
	ResponseMs   int                    `json:"responseMs"`
	ErrorMessage string                 `json:"errorMessage,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

func (p *ProbeDispatch) EnqueueRun(ctx context.Context, monitorID, orgID, name, mType, target string, interval int, prevStatus string, config, regions json.RawMessage, lastHB *time.Time, planTier string) error {
	runID := uuid.New().String()
	regionList := ParseRegions(regions)
	if len(regionList) == 0 {
		regionList = []string{"us-east"}
	}
	_, err := p.db.Exec(ctx, `
		INSERT INTO probe_runs (id, monitor_id, org_id, name, monitor_type, target_url, interval_seconds, prev_status, config, regions, plan_tier, last_heartbeat_at, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, 'pending')
	`, runID, monitorID, orgID, name, mType, target, interval, prevStatus, string(config), string(regions), planTier, lastHB)
	if err != nil {
		return err
	}
	for _, region := range regionList {
		taskID := uuid.New().String()
		_, err = p.db.Exec(ctx, `
			INSERT INTO probe_tasks (id, run_id, region, status) VALUES ($1, $2, $3, 'pending')
		`, taskID, runID, region)
		if err != nil {
			return err
		}
	}
	return nil
}

func (p *ProbeDispatch) ClaimTask(ctx context.Context, region, workerID string) (*ProbeTaskClaim, error) {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var taskID, runID string
	err = tx.QueryRow(ctx, `
		SELECT pt.id, pt.run_id FROM probe_tasks pt
		JOIN probe_runs pr ON pr.id = pt.run_id
		WHERE pt.status = 'pending' AND pt.region = $1 AND pr.status = 'pending'
		ORDER BY pt.created_at
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`, region).Scan(&taskID, &runID)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE probe_tasks SET status = 'claimed', worker_id = $1, claimed_at = now() WHERE id = $2
	`, workerID, taskID)
	if err != nil {
		return nil, err
	}

	var payload ProbeRunPayload
	var mType, target, name string
	var config json.RawMessage
	var interval int
	var lastHB *time.Time
	err = tx.QueryRow(ctx, `
		SELECT pr.id, pr.monitor_id, pr.org_id, pr.name, pr.monitor_type, pr.target_url, pr.config, pr.last_heartbeat_at, pr.interval_seconds
		FROM probe_runs pr WHERE pr.id = $1
	`, runID).Scan(&payload.RunID, &payload.MonitorID, &payload.OrgID, &name, &mType, &target, &config, &lastHB, &interval)
	if err != nil {
		return nil, err
	}
	payload.Name = name
	payload.Type = mType
	payload.Target = target
	payload.Config = config
	payload.LastHeartbeatAt = lastHB
	payload.IntervalSeconds = interval

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &ProbeTaskClaim{TaskID: taskID, RunID: runID, Region: region, Payload: payload}, nil
}

func (p *ProbeDispatch) CompleteTask(ctx context.Context, taskID string, result ProbeTaskResult) error {
	resultJSON, _ := json.Marshal(result)
	_, err := p.db.Exec(ctx, `
		UPDATE probe_tasks SET status = 'done', result = $1::jsonb, completed_at = now() WHERE id = $2 AND status = 'claimed'
	`, string(resultJSON), taskID)
	return err
}

func (p *ProbeDispatch) AggregatePending(ctx context.Context, sched *Scheduler) {
	rows, err := p.db.Query(ctx, `
		SELECT pr.id, pr.monitor_id, pr.org_id, pr.name, pr.monitor_type, pr.target_url, pr.interval_seconds,
		       pr.prev_status, pr.config, pr.regions, pr.plan_tier, pr.last_heartbeat_at
		FROM probe_runs pr
		WHERE pr.status = 'pending'
		  AND NOT EXISTS (SELECT 1 FROM probe_tasks pt WHERE pt.run_id = pr.id AND pt.status != 'done')
		  AND EXISTS (SELECT 1 FROM probe_tasks pt WHERE pt.run_id = pr.id)
		LIMIT 20
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var runID, id, orgID, name, mType, target, prevStatus, planTier string
		var interval int
		var config, regions json.RawMessage
		var lastHB *time.Time
		if err := rows.Scan(&runID, &id, &orgID, &name, &mType, &target, &interval, &prevStatus, &config, &regions, &planTier, &lastHB); err != nil {
			continue
		}
		sched.aggregateProbeRun(ctx, runID, id, orgID, name, mType, target, interval, prevStatus, config, regions, lastHB, planTier)
	}
}

func (s *Scheduler) aggregateProbeRun(ctx context.Context, runID, id, orgID, name, mType, target string, interval int, prevStatus string, config, regions json.RawMessage, lastHB *time.Time, planTier string) {
	taskRows, err := s.db.Query(ctx, `
		SELECT region, result FROM probe_tasks WHERE run_id = $1 AND status = 'done' ORDER BY region
	`, runID)
	if err != nil {
		return
	}
	defer taskRows.Close()

	type regionResult struct {
		region  string
		outcome CheckOutcome
	}
	var results []regionResult
	failCount := 0

	for taskRows.Next() {
		var region string
		var resultJSON []byte
		if err := taskRows.Scan(&region, &resultJSON); err != nil {
			continue
		}
		var pr ProbeTaskResult
		if json.Unmarshal(resultJSON, &pr) != nil {
			continue
		}
		outcome := CheckOutcome{
			IsUp:         pr.IsUp,
			StatusCode:   pr.StatusCode,
			ResponseMs:   pr.ResponseMs,
			ErrorMessage: pr.ErrorMessage,
			Metadata:     pr.Metadata,
		}
		if !outcome.IsUp {
			failCount++
		}
		results = append(results, regionResult{region: region, outcome: outcome})
	}
	if len(results) == 0 {
		return
	}

	regionList := ParseRegions(regions)
	quorum := len(regionList)/2 + 1
	if quorum < 1 {
		quorum = 1
	}
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
			log.Printf("probe aggregate insert: %v", err)
		}
	}

	s.applyCheckOutcome(ctx, id, orgID, name, prevStatus, interval, outcome, config, outcome.ResponseMs)

	s.security.AfterCheck(ctx, id, orgID, name, mType, config, outcome)
	s.checkResponseAnomaly(ctx, id, orgID, name, outcome.ResponseMs)
	_, _ = s.db.Exec(ctx, `UPDATE probe_runs SET status = 'done' WHERE id = $1`, runID)
}
