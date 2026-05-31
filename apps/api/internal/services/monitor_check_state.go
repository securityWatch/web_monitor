package services

import (
	"context"
	"encoding/json"
	"time"
)

const (
	defaultConsecutiveFailuresBeforeAlert = 1
	maxConsecutiveFailuresBeforeAlert     = 10
)

// MonitorConsecutiveFailuresThreshold reads alerts.consecutiveFailuresBeforeAlert (default 1, clamp 1–10).
func MonitorConsecutiveFailuresThreshold(config json.RawMessage) int {
	if len(config) == 0 || string(config) == "null" {
		return defaultConsecutiveFailuresBeforeAlert
	}
	var root map[string]json.RawMessage
	if json.Unmarshal(config, &root) != nil {
		return defaultConsecutiveFailuresBeforeAlert
	}
	alertsRaw, ok := root["alerts"]
	if !ok {
		return defaultConsecutiveFailuresBeforeAlert
	}
	var alerts struct {
		ConsecutiveFailuresBeforeAlert *int `json:"consecutiveFailuresBeforeAlert"`
	}
	if json.Unmarshal(alertsRaw, &alerts) != nil || alerts.ConsecutiveFailuresBeforeAlert == nil {
		return defaultConsecutiveFailuresBeforeAlert
	}
	n := *alerts.ConsecutiveFailuresBeforeAlert
	if n < 1 {
		return 1
	}
	if n > maxConsecutiveFailuresBeforeAlert {
		return maxConsecutiveFailuresBeforeAlert
	}
	return n
}

type MonitorCheckState struct {
	Status               string
	ConsecutiveFailures  int
	SetPendingDownAt     bool
	ClearPendingDownAt   bool
}

// ComputeMonitorCheckState derives monitor status and failure streak after one check.
func ComputeMonitorCheckState(checkUp bool, prevFailures, threshold int) MonitorCheckState {
	if threshold < 1 {
		threshold = 1
	}
	if checkUp {
		return MonitorCheckState{
			Status:              "up",
			ConsecutiveFailures: 0,
			ClearPendingDownAt:  true,
		}
	}

	failures := prevFailures + 1
	if failures >= threshold {
		return MonitorCheckState{
			Status:              "down",
			ConsecutiveFailures: failures,
			SetPendingDownAt:    prevFailures < threshold,
		}
	}
	return MonitorCheckState{
		Status:              "pending",
		ConsecutiveFailures: failures,
		ClearPendingDownAt:  true,
	}
}

func (s *Scheduler) applyCheckOutcome(ctx context.Context, id, orgID, name, prevStatus string, interval int, outcome CheckOutcome, config json.RawMessage, responseMs int) {
	threshold := MonitorConsecutiveFailuresThreshold(config)
	var prevFailures int
	_ = s.db.QueryRow(ctx, `SELECT consecutive_failures FROM monitors WHERE id = $1`, id).Scan(&prevFailures)

	state := ComputeMonitorCheckState(outcome.IsUp, prevFailures, threshold)
	now := time.Now().UTC()
	nextRun := now.Add(time.Duration(interval) * time.Second)

	switch {
	case state.SetPendingDownAt:
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, consecutive_failures = $5, pending_down_at = $2, updated_at = $2
			WHERE id = $6
		`, state.Status, now, responseMs, nextRun, state.ConsecutiveFailures, id)
	case state.ClearPendingDownAt:
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, consecutive_failures = $5, pending_down_at = NULL, updated_at = $2
			WHERE id = $6
		`, state.Status, now, responseMs, nextRun, state.ConsecutiveFailures, id)
	default:
		_, _ = s.db.Exec(ctx, `
			UPDATE monitors SET status = $1::monitor_status, last_checked_at = $2, last_response_ms = $3,
			       next_run_at = $4, consecutive_failures = $5, updated_at = $2
			WHERE id = $6
		`, state.Status, now, responseMs, nextRun, state.ConsecutiveFailures, id)
	}

	if state.Status == "up" && (prevStatus == "down" || prevStatus == "pending") {
		s.handleRecovery(ctx, id, orgID, name)
	}
}
