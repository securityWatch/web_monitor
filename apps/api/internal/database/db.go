package database

import (
	"context"
	"embed"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

var migrationFiles = []string{
	"migrations/001_initial.sql",
	"migrations/002_locale.sql",
	"migrations/003_p0_features.sql",
	"migrations/004_p1_p2_features.sql",
	"migrations/005_phase2_features.sql",
	"migrations/006_phase3_features.sql",
	"migrations/007_phase4_core.sql",
	"migrations/008_cn_alert_channels.sql",
	"migrations/009_phase5.sql",
}

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if err := runMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	if err := ensurePartitions(ctx, pool); err != nil {
		log.Printf("warn: ensure partitions: %v", err)
	}

	return pool, nil
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	for _, file := range migrationFiles {
		data, err := migrationsFS.ReadFile(file)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("%s: %w", file, err)
		}
	}
	return nil
}

func ensurePartitions(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now().UTC()
	for i := -1; i <= 2; i++ {
		t := now.AddDate(0, i, 0)
		partName := fmt.Sprintf("check_results_%s", t.Format("2006_01"))
		start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 1, 0)
		sql := fmt.Sprintf(`
			CREATE TABLE IF NOT EXISTS %s PARTITION OF check_results
			FOR VALUES FROM ('%s') TO ('%s');
		`, partName, start.Format(time.RFC3339), end.Format(time.RFC3339))
		if _, err := pool.Exec(ctx, sql); err != nil {
			if !strings.Contains(err.Error(), "already exists") {
				return err
			}
		}
	}
	return nil
}
