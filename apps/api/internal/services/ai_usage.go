package services

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RecordAIUsage(ctx context.Context, db *pgxpool.Pool, orgID, feature, status, detail string) {
	if db == nil || orgID == "" || feature == "" {
		return
	}
	if status == "" {
		status = "ok"
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO ai_usage (id, org_id, feature, status, detail)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''))
	`, uuid.New().String(), orgID, feature, status, detail)
}

func AIUsageCount(ctx context.Context, db *pgxpool.Pool, orgID, feature, window string) int {
	if db == nil || orgID == "" || feature == "" || window == "" {
		return 0
	}
	var count int
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*) FROM ai_usage
		WHERE org_id = $1 AND feature = $2 AND created_at > now() - ($3)::interval
	`, orgID, feature, window).Scan(&count)
	return count
}

func CheckAIQuota(ctx context.Context, db *pgxpool.Pool, orgID, planTier, feature string) error {
	if planTier != "free" {
		return nil
	}
	limits := map[string]int{
		"monitor_draft":      20,
		"incident_summary":   10,
		"visual_explain":     10,
		"security_report":    3,
		"alert_explain":      30,
		"weekly_report_auto": 1,
	}
	limit, ok := limits[feature]
	if !ok || limit <= 0 {
		return nil
	}
	if AIUsageCount(ctx, db, orgID, feature, "24 hours") >= limit {
		return fmt.Errorf("AI quota exceeded for free plan")
	}
	return nil
}
