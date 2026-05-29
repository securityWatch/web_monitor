package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
)

type DashboardHandler struct {
	db *pgxpool.Pool
}

func NewDashboardHandler(db *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{db: db}
}

func (h *DashboardHandler) Get(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	ctx := c.Request.Context()

	var exists bool
	_ = h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var stats models.DashboardStats
	_ = h.db.QueryRow(ctx, `
		SELECT
		  COUNT(*),
		  COUNT(*) FILTER (WHERE status = 'up'),
		  COUNT(*) FILTER (WHERE status = 'down'),
		  COUNT(*) FILTER (WHERE status = 'paused')
		FROM monitors WHERE org_id = $1
	`, orgID).Scan(&stats.TotalMonitors, &stats.UpCount, &stats.DownCount, &stats.PausedCount)

	var uptime *float64
	var errorRate *float64
	var failedChecks, totalChecks int
	_ = h.db.QueryRow(ctx, `
		SELECT
		  COUNT(*),
		  COUNT(*) FILTER (WHERE NOT is_up),
		  ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2),
		  ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_up) / NULLIF(COUNT(*), 0), 2)
		FROM check_results WHERE org_id = $1 AND checked_at > now() - interval '24 hours'
	`, orgID).Scan(&totalChecks, &failedChecks, &uptime, &errorRate)
	stats.TotalChecks24h = totalChecks
	stats.FailedChecks24h = failedChecks
	if uptime != nil {
		stats.Uptime24h = *uptime
	} else {
		stats.Uptime24h = 100
	}
	if errorRate != nil {
		stats.ErrorRate24h = *errorRate
	}

	_ = h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM incidents WHERE org_id = $1 AND status = 'open'
	`, orgID).Scan(&stats.OpenIncidents)

	// Response time trend
	trendRows, _ := h.db.Query(ctx, `
		SELECT date_trunc('hour', checked_at) as bucket,
		       COALESCE(AVG(response_ms), 0)::float,
		       COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms), 0)::float
		FROM check_results
		WHERE org_id = $1 AND checked_at > now() - interval '24 hours' AND is_up = true
		GROUP BY 1 ORDER BY 1
	`, orgID)
	if trendRows != nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var p models.ResponseTimePoint
			var t time.Time
			if err := trendRows.Scan(&t, &p.AvgMs, &p.P95Ms); err != nil {
				continue
			}
			p.Time = t.Format(time.RFC3339)
			stats.ResponseTimeTrend = append(stats.ResponseTimeTrend, p)
		}
	}
	if stats.ResponseTimeTrend == nil {
		stats.ResponseTimeTrend = []models.ResponseTimePoint{}
	}

	// Recent incidents
	incRows, _ := h.db.Query(ctx, `
		SELECT i.id, i.org_id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.status, i.severity, i.message
		FROM incidents i
		JOIN monitors m ON m.id = i.monitor_id
		WHERE i.org_id = $1
		ORDER BY i.started_at DESC LIMIT 10
	`, orgID)
	if incRows != nil {
		defer incRows.Close()
		for incRows.Next() {
			var inc models.Incident
			if err := incRows.Scan(&inc.ID, &inc.OrgID, &inc.MonitorID, &inc.MonitorName, &inc.StartedAt, &inc.ResolvedAt, &inc.Status, &inc.Severity, &inc.Message); err != nil {
				continue
			}
			stats.RecentIncidents = append(stats.RecentIncidents, inc)
		}
	}
	if stats.RecentIncidents == nil {
		stats.RecentIncidents = []models.Incident{}
	}

	failRows, _ := h.db.Query(ctx, `
		SELECT cr.monitor_id, m.name, cr.checked_at, cr.error_message, cr.status_code
		FROM check_results cr
		JOIN monitors m ON m.id = cr.monitor_id
		WHERE cr.org_id = $1 AND cr.is_up = false
		ORDER BY cr.checked_at DESC
		LIMIT 20
	`, orgID)
	if failRows != nil {
		defer failRows.Close()
		for failRows.Next() {
			var f models.RecentFailure
			if err := failRows.Scan(&f.MonitorID, &f.MonitorName, &f.CheckedAt, &f.ErrorMessage, &f.StatusCode); err != nil {
				continue
			}
			stats.RecentFailures = append(stats.RecentFailures, f)
		}
	}
	if stats.RecentFailures == nil {
		stats.RecentFailures = []models.RecentFailure{}
	}

	// Top monitors
	monRows, _ := h.db.Query(ctx, `
		SELECT m.id, m.org_id, m.name, m.type, m.target_url, m.interval_seconds, m.status,
		       m.config, m.regions, m.last_checked_at, m.last_response_ms, m.created_at, m.updated_at,
		       COALESCE((
		         SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2)
		         FROM check_results WHERE monitor_id = m.id AND checked_at > now() - interval '24 hours'
		       ), 100) as uptime_24h
		FROM monitors m WHERE m.org_id = $1
		ORDER BY CASE m.status WHEN 'down' THEN 0 ELSE 1 END, m.last_checked_at DESC NULLS LAST
		LIMIT 5
	`, orgID)
	if monRows != nil {
		defer monRows.Close()
		for monRows.Next() {
			var m models.Monitor
			if err := monRows.Scan(&m.ID, &m.OrgID, &m.Name, &m.Type, &m.TargetURL, &m.IntervalSeconds, &m.Status,
				&m.Config, &m.Regions, &m.LastCheckedAt, &m.LastResponseMs, &m.CreatedAt, &m.UpdatedAt, &m.Uptime24h); err != nil {
				continue
			}
			stats.TopMonitors = append(stats.TopMonitors, m)
		}
	}
	if stats.TopMonitors == nil {
		stats.TopMonitors = []models.Monitor{}
	}

	c.JSON(http.StatusOK, stats)
}

type IncidentHandler struct {
	db *pgxpool.Pool
}

func NewIncidentHandler(db *pgxpool.Pool) *IncidentHandler {
	return &IncidentHandler{db: db}
}

func (h *IncidentHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	ctx := c.Request.Context()

	var exists bool
	_ = h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	status := c.Query("status")
	query := `
		SELECT i.id, i.org_id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.status, i.severity, i.message
		FROM incidents i JOIN monitors m ON m.id = i.monitor_id
		WHERE i.org_id = $1
	`
	args := []interface{}{orgID}
	if status != "" && status != "all" {
		query += ` AND i.status = $2::incident_status`
		args = append(args, status)
	}
	query += ` ORDER BY i.started_at DESC LIMIT 50`

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var incidents []models.Incident
	for rows.Next() {
		var inc models.Incident
		if err := rows.Scan(&inc.ID, &inc.OrgID, &inc.MonitorID, &inc.MonitorName, &inc.StartedAt, &inc.ResolvedAt, &inc.Status, &inc.Severity, &inc.Message); err != nil {
			continue
		}
		incidents = append(incidents, inc)
	}
	if incidents == nil {
		incidents = []models.Incident{}
	}
	c.JSON(http.StatusOK, gin.H{"incidents": incidents})
}
