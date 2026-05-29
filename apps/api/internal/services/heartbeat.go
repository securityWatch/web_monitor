package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HeartbeatService struct {
	db *pgxpool.Pool
}

func NewHeartbeatService(db *pgxpool.Pool) *HeartbeatService {
	return &HeartbeatService{db: db}
}

func GenerateHeartbeatToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *HeartbeatService) Ping(ctx context.Context, token string) error {
	res, err := h.db.Exec(ctx, `
		UPDATE monitors SET last_heartbeat_at = now(), status = 'up', pending_down_at = NULL, updated_at = now()
		WHERE heartbeat_token = $1 AND type = 'heartbeat'
	`, token)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("invalid token")
	}
	return nil
}

func RunHeartbeatCheck(ctx context.Context, db *pgxpool.Pool, monitorID string, intervalSeconds int, lastHeartbeat *time.Time, start time.Time) CheckOutcome {
	elapsed := int(time.Since(start).Milliseconds())
	grace := time.Duration(intervalSeconds*2) * time.Second
	if intervalSeconds < 60 {
		grace = time.Duration(intervalSeconds+intervalSeconds/2) * time.Second
	}
	if lastHeartbeat == nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: "no heartbeat received yet"}
	}
	if time.Since(*lastHeartbeat) > grace {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: fmt.Sprintf("heartbeat overdue (last %s ago)", time.Since(*lastHeartbeat).Round(time.Second))}
	}
	return CheckOutcome{IsUp: true, ResponseMs: elapsed, Metadata: map[string]interface{}{"lastHeartbeat": lastHeartbeat.UTC().Format(time.RFC3339)}}
}

func ParseRegions(raw json.RawMessage) []string {
	var regions []string
	_ = json.Unmarshal(raw, &regions)
	if len(regions) == 0 {
		return []string{"us-east"}
	}
	return regions
}

func IsInMaintenance(ctx context.Context, db *pgxpool.Pool, orgID, monitorID string) bool {
	var exists bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM maintenance_windows
			WHERE org_id = $1 AND starts_at <= now() AND ends_at >= now()
			  AND (monitor_id IS NULL OR monitor_id = $2)
		)
	`, orgID, monitorID).Scan(&exists)
	return exists
}

func MaxAlertDelayMinutes(ctx context.Context, db *pgxpool.Pool, orgID, monitorID string) int {
	var delay *int
	_ = db.QueryRow(ctx, `
		SELECT MAX(ar.delay_minutes) FROM alert_rules ar
		WHERE ar.org_id = $1 AND ar.enabled = true
		  AND (ar.monitor_id IS NULL OR ar.monitor_id = $2)
	`, orgID, monitorID).Scan(&delay)
	if delay == nil {
		return 0
	}
	return *delay
}
