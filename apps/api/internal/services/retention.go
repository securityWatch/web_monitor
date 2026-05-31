package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultRawRetentionDays   = 7
	defaultTotalRetentionDays = 90
)

// RetentionService purges old check_results and maintains 5-minute rollups.
type RetentionService struct {
	db              *pgxpool.Pool
	rawRetention    time.Duration
	totalRetention  time.Duration
	lastRun         time.Time
	minRunInterval  time.Duration
}

func NewRetentionService(db *pgxpool.Pool, rawDays, totalDays int) *RetentionService {
	if rawDays <= 0 {
		rawDays = defaultRawRetentionDays
	}
	if totalDays <= 0 {
		totalDays = defaultTotalRetentionDays
	}
	if totalDays <= rawDays {
		totalDays = rawDays + 1
	}
	return &RetentionService{
		db:             db,
		rawRetention:   time.Duration(rawDays) * 24 * time.Hour,
		totalRetention: time.Duration(totalDays) * 24 * time.Hour,
		minRunInterval: time.Hour,
	}
}

// MaybeRun executes retention at most once per hour.
func (r *RetentionService) MaybeRun(ctx context.Context) {
	if time.Since(r.lastRun) < r.minRunInterval {
		return
	}
	if err := r.Run(ctx); err != nil {
		log.Printf("retention: %v", err)
		return
	}
	r.lastRun = time.Now()
}

// Run aggregates raw checks older than rawRetention, deletes them, and drops partitions past totalRetention.
func (r *RetentionService) Run(ctx context.Context) error {
	now := time.Now().UTC()
	rawCutoff := now.Add(-r.rawRetention)
	totalCutoff := now.Add(-r.totalRetention)

	tag, err := r.db.Exec(ctx, `
		INSERT INTO check_results_rollup_5m (
			org_id, monitor_id, region, bucket_at,
			total_count, up_count, avg_response_ms, min_response_ms, max_response_ms
		)
		SELECT
			org_id,
			monitor_id,
			region,
			date_trunc('5 minutes', checked_at) AS bucket_at,
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE is_up)::int,
			COALESCE(AVG(response_ms)::int, 0),
			MIN(response_ms),
			MAX(response_ms)
		FROM check_results
		WHERE checked_at >= $1 AND checked_at < $2
		GROUP BY org_id, monitor_id, region, date_trunc('5 minutes', checked_at)
		ON CONFLICT (monitor_id, region, bucket_at) DO UPDATE SET
			total_count = EXCLUDED.total_count,
			up_count = EXCLUDED.up_count,
			avg_response_ms = EXCLUDED.avg_response_ms,
			min_response_ms = EXCLUDED.min_response_ms,
			max_response_ms = EXCLUDED.max_response_ms
	`, totalCutoff, rawCutoff)
	if err != nil {
		return fmt.Errorf("rollup: %w", err)
	}
	if tag.RowsAffected() > 0 {
		log.Printf("retention: upserted %d rollup buckets", tag.RowsAffected())
	}

	del, err := r.db.Exec(ctx, `DELETE FROM check_results WHERE checked_at < $1`, rawCutoff)
	if err != nil {
		return fmt.Errorf("delete raw: %w", err)
	}
	if del.RowsAffected() > 0 {
		log.Printf("retention: deleted %d raw check rows", del.RowsAffected())
	}

	_, _ = r.db.Exec(ctx, `
		DELETE FROM check_results_rollup_5m WHERE bucket_at < $1
	`, totalCutoff)

	if err := r.dropOldPartitions(ctx, totalCutoff); err != nil {
		return err
	}
	return nil
}

func (r *RetentionService) dropOldPartitions(ctx context.Context, totalCutoff time.Time) error {
	rows, err := r.db.Query(ctx, `
		SELECT c.relname
		FROM pg_inherits i
		JOIN pg_class c ON c.oid = i.inhrelid
		JOIN pg_class p ON p.oid = i.inhparent
		WHERE p.relname = 'check_results'
	`)
	if err != nil {
		return fmt.Errorf("list partitions: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		if name == "check_results_default" {
			continue
		}
		partMonth, ok := parseCheckResultsPartitionMonth(name)
		if !ok {
			continue
		}
		partEnd := partMonth.AddDate(0, 1, 0)
		if !partEnd.After(totalCutoff) {
			sql := fmt.Sprintf(`DROP TABLE IF EXISTS %s`, name)
			if _, err := r.db.Exec(ctx, sql); err != nil && !strings.Contains(err.Error(), "does not exist") {
				log.Printf("retention: drop %s: %v", name, err)
			} else {
				log.Printf("retention: dropped partition %s", name)
			}
		}
	}
	return nil
}

func parseCheckResultsPartitionMonth(name string) (time.Time, bool) {
	const prefix = "check_results_"
	if !strings.HasPrefix(name, prefix) {
		return time.Time{}, false
	}
	suffix := strings.TrimPrefix(name, prefix)
	t, err := time.Parse("2006_01", suffix)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC), true
}
