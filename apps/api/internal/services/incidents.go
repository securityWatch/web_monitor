package services

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IncidentService struct {
	db *pgxpool.Pool
}

func NewIncidentService(db *pgxpool.Pool) *IncidentService {
	return &IncidentService{db: db}
}

func (s *IncidentService) CreateOrMerge(ctx context.Context, orgID, monitorID, monitorName, detail string) (string, bool, error) {
	var existingID string
	err := s.db.QueryRow(ctx, `
		SELECT i.id FROM incidents i
		WHERE i.org_id = $1 AND i.status = 'open'
		  AND i.started_at > now() - interval '5 minutes'
		ORDER BY i.started_at DESC LIMIT 1
	`, orgID).Scan(&existingID)
	if err == nil && existingID != "" {
		_, _ = s.db.Exec(ctx, `
			INSERT INTO incident_monitors (incident_id, monitor_id) VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, existingID, monitorID)
		s.AddTimeline(ctx, existingID, "monitor_added", fmt.Sprintf("Monitor %s affected", monitorName), nil)
		return existingID, true, nil
	}

	title := monitorName + " is down"
	incidentID := uuid.New().String()
	err = s.db.QueryRow(ctx, `
		INSERT INTO incidents (id, org_id, monitor_id, started_at, status, severity, message, title, workflow_status, sync_status_page)
		VALUES ($1, $2, $3, now(), 'open', 'critical', $4, $5, 'investigating', true)
		RETURNING id
	`, incidentID, orgID, monitorID, detail, title).Scan(&incidentID)
	if err != nil {
		return "", false, err
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO incident_monitors (incident_id, monitor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, incidentID, monitorID)
	s.AddTimeline(ctx, incidentID, "created", fmt.Sprintf("Incident opened: %s", detail), nil)
	s.AddTimeline(ctx, incidentID, "alert", "Down alert triggered", nil)
	return incidentID, false, nil
}

func (s *IncidentService) AddTimeline(ctx context.Context, incidentID, kind, message string, userID *string) {
	_, _ = s.db.Exec(ctx, `
		INSERT INTO incident_timeline (id, incident_id, kind, message, user_id)
		VALUES ($1, $2, $3, $4, $5)
	`, uuid.New().String(), incidentID, kind, message, userID)
}

func (s *IncidentService) SyncStatusPage(ctx context.Context, orgID, incidentID, title string) {
	var sync bool
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(sync_status_page, false) FROM incidents WHERE id = $1`, incidentID).Scan(&sync)
	if !sync {
		return
	}
	rows, err := s.db.Query(ctx, `
		SELECT sp.id FROM status_pages sp
		JOIN incident_monitors im ON im.incident_id = $1
		JOIN status_page_monitors spm ON spm.monitor_id = im.monitor_id AND spm.status_page_id = sp.id
		WHERE sp.org_id = $2 AND sp.is_public = true
	`, incidentID, orgID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var pageID string
		if rows.Scan(&pageID) != nil {
			continue
		}
		_, _ = s.db.Exec(ctx, `
			INSERT INTO status_page_incidents (id, status_page_id, incident_id, title, impact, is_public)
			VALUES ($1, $2, $3, $4, 'major', true)
		`, uuid.New().String(), pageID, incidentID, title)
	}
}

func (s *IncidentService) ResolveByMonitor(ctx context.Context, monitorID string) {
	var incidentID string
	err := s.db.QueryRow(ctx, `
		SELECT id FROM incidents WHERE monitor_id = $1 AND status = 'open' ORDER BY started_at DESC LIMIT 1
	`, monitorID).Scan(&incidentID)
	if err != nil {
		return
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE incidents SET status = 'resolved', resolved_at = now(), workflow_status = 'resolved'
		WHERE id = $1
	`, incidentID)
	s.AddTimeline(ctx, incidentID, "resolved", "Monitor recovered", nil)
	_, _ = s.db.Exec(ctx, `UPDATE status_page_incidents SET resolved_at = now() WHERE incident_id = $1 AND resolved_at IS NULL`, incidentID)
}
