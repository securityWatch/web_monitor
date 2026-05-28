package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
	"github.com/pulsewatch/api/internal/services"
)

type MonitorHandler struct {
	db *pgxpool.Pool
}

func NewMonitorHandler(db *pgxpool.Pool) *MonitorHandler {
	return &MonitorHandler{db: db}
}

func (h *MonitorHandler) verifyOrgAccess(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	return exists
}

func (h *MonitorHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	statusFilter := c.Query("status")
	search := c.Query("search")

	query := `
		SELECT m.id, m.org_id, m.name, m.type, m.target_url, m.interval_seconds, m.status,
		       m.config, m.regions, m.last_checked_at, m.last_response_ms, m.created_at, m.updated_at,
		       COALESCE((
		         SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2)
		         FROM check_results WHERE monitor_id = m.id AND checked_at > now() - interval '24 hours'
		       ), 100) as uptime_24h
		FROM monitors m
		WHERE m.org_id = $1
	`
	args := []interface{}{orgID}
	argIdx := 2

	if statusFilter != "" && statusFilter != "all" {
		query += ` AND m.status = $` + strconv.Itoa(argIdx) + `::monitor_status`
		args = append(args, statusFilter)
		argIdx++
	}
	if search != "" {
		query += ` AND (m.name ILIKE $` + strconv.Itoa(argIdx) + ` OR m.target_url ILIKE $` + strconv.Itoa(argIdx) + `)`
		args = append(args, "%"+search+"%")
		argIdx++
	}
	query += ` ORDER BY CASE m.status WHEN 'down' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, m.name`

	rows, err := h.db.Query(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var monitors []models.Monitor
	for rows.Next() {
		var m models.Monitor
		if err := rows.Scan(&m.ID, &m.OrgID, &m.Name, &m.Type, &m.TargetURL, &m.IntervalSeconds, &m.Status,
			&m.Config, &m.Regions, &m.LastCheckedAt, &m.LastResponseMs, &m.CreatedAt, &m.UpdatedAt, &m.Uptime24h); err != nil {
			continue
		}
		monitors = append(monitors, m)
	}
	if monitors == nil {
		monitors = []models.Monitor{}
	}
	c.JSON(http.StatusOK, gin.H{"monitors": monitors})
}

func (h *MonitorHandler) Get(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	m, err := h.fetchMonitor(c, orgID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *MonitorHandler) Create(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden", "code": "FORBIDDEN"})
		return
	}

	var req struct {
		Name            string          `json:"name" binding:"required"`
		Type            string          `json:"type" binding:"required"`
		TargetURL       string          `json:"targetUrl" binding:"required"`
		IntervalSeconds int             `json:"intervalSeconds"`
		Config          json.RawMessage `json:"config"`
		Regions         json.RawMessage `json:"regions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var planTier string
	var monitorQuota int
	_ = h.db.QueryRow(c.Request.Context(), `SELECT plan_tier, monitor_quota FROM organizations WHERE id = $1`, orgID).Scan(&planTier, &monitorQuota)

	var count int
	_ = h.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM monitors WHERE org_id = $1`, orgID).Scan(&count)
	if count >= monitorQuota {
		c.JSON(http.StatusForbidden, gin.H{"error": "monitor quota exceeded", "code": "MONITOR_QUOTA_EXCEEDED"})
		return
	}

	minInterval := services.PlanMinInterval(planTier)
	if req.IntervalSeconds == 0 {
		req.IntervalSeconds = minInterval
	}
	if req.IntervalSeconds < minInterval {
		req.IntervalSeconds = minInterval
	}

	target, err := services.NormalizeURL(req.TargetURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validTypes := map[string]bool{"http": true, "tcp": true, "ping": true, "keyword": true, "ssl": true}
	if !validTypes[strings.ToLower(req.Type)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid monitor type"})
		return
	}

	if req.Config == nil {
		req.Config = json.RawMessage(`{}`)
	}
	if req.Regions == nil {
		req.Regions = json.RawMessage(`["us-east"]`)
	}

	id := uuid.New().String()
	_, err = h.db.Exec(c.Request.Context(), `
		INSERT INTO monitors (id, org_id, name, type, target_url, interval_seconds, status, config, regions, next_run_at)
		VALUES ($1, $2, $3, $4::monitor_type, $5, $6, 'pending', $7, $8, now())
	`, id, orgID, req.Name, req.Type, target, req.IntervalSeconds, req.Config, req.Regions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Auto-create alert rule for new monitor
	var channelID string
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT id FROM alert_channels WHERE org_id = $1 AND enabled = true LIMIT 1
	`, orgID).Scan(&channelID)
	if channelID != "" {
		_, _ = h.db.Exec(c.Request.Context(), `
			INSERT INTO alert_rules (id, org_id, monitor_id, channel_id, event_type, enabled)
			VALUES ($1, $2, $3, $4, 'all', true)
		`, uuid.New().String(), orgID, id, channelID)
	}

	m, _ := h.fetchMonitor(c, orgID, id)
	c.JSON(http.StatusCreated, m)
}

func (h *MonitorHandler) Update(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req struct {
		Name            *string         `json:"name"`
		TargetURL       *string         `json:"targetUrl"`
		IntervalSeconds *int            `json:"intervalSeconds"`
		Status          *string         `json:"status"`
		Config          json.RawMessage `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET name = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, *req.Name, id, orgID)
	}
	if req.TargetURL != nil {
		target, err := services.NormalizeURL(*req.TargetURL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET target_url = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, target, id, orgID)
	}
	if req.IntervalSeconds != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET interval_seconds = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, *req.IntervalSeconds, id, orgID)
	}
	if req.Status != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET status = $1::monitor_status, updated_at = now() WHERE id = $2 AND org_id = $3`, *req.Status, id, orgID)
	}
	if req.Config != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET config = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, req.Config, id, orgID)
	}

	m, err := h.fetchMonitor(c, orgID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *MonitorHandler) Delete(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	res, err := h.db.Exec(c.Request.Context(), `DELETE FROM monitors WHERE id = $1 AND org_id = $2`, id, orgID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *MonitorHandler) GetChecks(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, monitor_id, checked_at, region, status_code, response_ms, is_up, error_message, metadata
		FROM check_results WHERE monitor_id = $1 AND org_id = $2
		ORDER BY checked_at DESC LIMIT 100
	`, id, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var results []models.CheckResult
	for rows.Next() {
		var r models.CheckResult
		if err := rows.Scan(&r.ID, &r.MonitorID, &r.CheckedAt, &r.Region, &r.StatusCode, &r.ResponseMs, &r.IsUp, &r.ErrorMessage, &r.Metadata); err != nil {
			continue
		}
		results = append(results, r)
	}
	if results == nil {
		results = []models.CheckResult{}
	}
	c.JSON(http.StatusOK, gin.H{"checks": results})
}

func (h *MonitorHandler) GetStats(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT date_trunc('hour', checked_at) as bucket,
		       AVG(response_ms)::float as avg_ms,
		       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)::float as p95_ms
		FROM check_results
		WHERE monitor_id = $1 AND org_id = $2 AND checked_at > now() - interval '24 hours' AND is_up = true
		GROUP BY 1 ORDER BY 1
	`, id, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var trend []models.ResponseTimePoint
	for rows.Next() {
		var p models.ResponseTimePoint
		var t interface{}
		if err := rows.Scan(&t, &p.AvgMs, &p.P95Ms); err != nil {
			continue
		}
		p.Time = t.(string)
		trend = append(trend, p)
	}
	c.JSON(http.StatusOK, gin.H{"trend": trend})
}

func (h *MonitorHandler) fetchMonitor(c *gin.Context, orgID, id string) (*models.Monitor, error) {
	var m models.Monitor
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, name, type, target_url, interval_seconds, status,
		       config, regions, last_checked_at, last_response_ms, created_at, updated_at
		FROM monitors WHERE id = $1 AND org_id = $2
	`, id, orgID).Scan(&m.ID, &m.OrgID, &m.Name, &m.Type, &m.TargetURL, &m.IntervalSeconds, &m.Status,
		&m.Config, &m.Regions, &m.LastCheckedAt, &m.LastResponseMs, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
