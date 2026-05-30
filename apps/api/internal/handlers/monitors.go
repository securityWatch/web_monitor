package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

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

func (h *MonitorHandler) AIDraft(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var planTier string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT plan_tier FROM organizations WHERE id = $1`, orgID).Scan(&planTier)
	if err := services.CheckAIQuota(c.Request.Context(), h.db, orgID, planTier, "monitor_draft"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "AI_QUOTA_EXCEEDED"})
		return
	}
	draft, err := services.BuildMonitorDraftWithAI(c.Request.Context(), req.Prompt)
	if err != nil {
		services.RecordAIUsage(c.Request.Context(), h.db, orgID, "monitor_draft", "error", err.Error())
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "code": "AI_UNAVAILABLE"})
		return
	}
	services.RecordAIUsage(c.Request.Context(), h.db, orgID, "monitor_draft", "ok", "")
	validTypes := map[string]bool{"http": true, "tcp": true, "ping": true, "api_json": true, "keyword": true, "ssl": true, "heartbeat": true, "dns": true, "domain": true, "pagespeed": true, "tamper": true}
	if !validTypes[strings.ToLower(draft.Type)] {
		draft.Type = "http"
	}
	c.JSON(http.StatusOK, gin.H{"draft": draft})
}

func (h *MonitorHandler) AIVisualExplain(c *gin.Context) {
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
	var planTier string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT plan_tier FROM organizations WHERE id = $1`, orgID).Scan(&planTier)
	if err := services.CheckAIQuota(c.Request.Context(), h.db, orgID, planTier, "visual_explain"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "AI_QUOTA_EXCEEDED"})
		return
	}
	var checkedAt *time.Time
	var isUp *bool
	var errMsg *string
	var meta json.RawMessage
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT checked_at, is_up, error_message, metadata
		FROM check_results
		WHERE org_id = $1 AND monitor_id = $2
		ORDER BY checked_at DESC LIMIT 1
	`, orgID, id).Scan(&checkedAt, &isUp, &errMsg, &meta)
	var artifactCount int
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT COUNT(*) FROM check_artifacts
		WHERE org_id = $1 AND monitor_id = $2 AND kind = 'screenshot' AND (expires_at IS NULL OR expires_at > now())
	`, orgID, id).Scan(&artifactCount)
	artifactRows, _ := h.db.Query(c.Request.Context(), `
		SELECT kind, content_type, storage_url, created_at FROM check_artifacts
		WHERE org_id = $1 AND monitor_id = $2 AND (expires_at IS NULL OR expires_at > now())
		ORDER BY created_at DESC LIMIT 5
	`, orgID, id)
	var artifactHints []string
	if artifactRows != nil {
		defer artifactRows.Close()
		for artifactRows.Next() {
			var kind, ct, url string
			var created time.Time
			if artifactRows.Scan(&kind, &ct, &url, &created) == nil {
				if len(url) > 180 {
					url = url[:180]
				}
				artifactHints = append(artifactHints, fmt.Sprintf("%s %s %s %s", created.Format(time.RFC3339), kind, ct, url))
			}
		}
	}
	errText := ""
	if errMsg != nil {
		errText = *errMsg
	}
	input := fmt.Sprintf("Monitor: %s\nType: %s\nTarget: %s\nStatus: %s\nLatest check: %v\nLatest isUp: %v\nError: %s\nMetadata JSON: %s\nScreenshot artifacts available: %d\nRecent artifact hints:\n%s",
		m.Name, m.Type, m.TargetURL, m.Status, checkedAt, isUp, errText, string(meta), artifactCount, strings.Join(artifactHints, "\n"))
	explanation, err := services.ExplainVisualTamperWithAI(c.Request.Context(), input)
	if err != nil {
		services.RecordAIUsage(c.Request.Context(), h.db, orgID, "visual_explain", "error", err.Error())
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "code": "AI_UNAVAILABLE"})
		return
	}
	services.RecordAIUsage(c.Request.Context(), h.db, orgID, "visual_explain", "ok", "")
	c.JSON(http.StatusOK, gin.H{"explanation": explanation})
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
		TargetURL       string          `json:"targetUrl"`
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

	userID := GetUserID(c)
	if !services.IsEmailVerified(c.Request.Context(), h.db, userID) {
		var unverifiedCount int
		_ = h.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM monitors WHERE org_id = $1`, orgID).Scan(&unverifiedCount)
		if unverifiedCount >= 3 {
			c.JSON(http.StatusForbidden, gin.H{"error": "verify email to add more than 3 monitors", "code": "EMAIL_NOT_VERIFIED"})
			return
		}
	}

	if req.Config == nil {
		req.Config = json.RawMessage(`{}`)
	}
	if req.Regions == nil {
		req.Regions = json.RawMessage(`["us-east"]`)
	}

	minInterval := services.PlanMinIntervalForMonitor(planTier, req.Type, req.Config)
	if req.IntervalSeconds == 0 {
		req.IntervalSeconds = minInterval
	}
	if strings.ToLower(req.Type) == "domain" && req.IntervalSeconds < 86400 {
		req.IntervalSeconds = 86400
	}

	validTypes := map[string]bool{"http": true, "tcp": true, "ping": true, "keyword": true, "ssl": true, "heartbeat": true, "dns": true, "domain": true, "pagespeed": true, "tamper": true, "api_json": true}
	if strings.ToLower(req.Type) == "api_json" && planTier == "free" {
		c.JSON(http.StatusForbidden, gin.H{"error": "API/JSON monitors require Pro or higher", "code": "PLAN_UPGRADE_REQUIRED"})
		return
	}

	if !validTypes[strings.ToLower(req.Type)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid monitor type"})
		return
	}

	target := req.TargetURL
	if strings.ToLower(req.Type) == "heartbeat" {
		target = "heartbeat://ping"
	} else if strings.ToLower(req.Type) == "dns" {
		target = strings.TrimPrefix(strings.TrimPrefix(req.TargetURL, "dns://"), "http://")
		target = strings.Split(target, "/")[0]
	} else if strings.ToLower(req.Type) == "domain" {
		target = strings.TrimPrefix(strings.TrimPrefix(strings.ToLower(req.TargetURL), "domain://"), "http://")
		target = strings.Split(target, "/")[0]
	} else if strings.ToLower(req.Type) == "tamper" {
		var err error
		target, err = services.NormalizeURL(req.TargetURL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else if strings.ToLower(req.Type) == "pagespeed" {
		var err error
		target, err = services.NormalizeURL(req.TargetURL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		var err error
		target, err = services.NormalizeURL(req.TargetURL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if req.IntervalSeconds < minInterval && strings.ToLower(req.Type) != "domain" {
		req.IntervalSeconds = minInterval
	}

	regions := services.ParseRegions(req.Regions)
	maxRegions := services.PlanMaxRegions(planTier)
	if len(regions) > maxRegions {
		c.JSON(http.StatusForbidden, gin.H{"error": "region limit exceeded", "code": "REGION_QUOTA_EXCEEDED", "maxRegions": maxRegions})
		return
	}

	id := uuid.New().String()
	hbToken := ""
	if strings.ToLower(req.Type) == "heartbeat" {
		hbToken = services.GenerateHeartbeatToken()
	}

	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO monitors (id, org_id, name, type, target_url, interval_seconds, status, config, regions, heartbeat_token, next_run_at)
		VALUES ($1, $2, $3, $4::monitor_type, $5, $6, 'pending', $7, $8, NULLIF($9, ''), now())
	`, id, orgID, req.Name, req.Type, target, req.IntervalSeconds, req.Config, req.Regions, hbToken)
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
	services.LogAudit(c.Request.Context(), h.db, orgID, GetUserID(c), "monitor.create", c.ClientIP(), map[string]interface{}{"name": req.Name, "id": id})
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
		Regions         json.RawMessage `json:"regions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var planTier, currentType string
	var currentConfig json.RawMessage
	var currentInterval int
	if err := h.db.QueryRow(c.Request.Context(), `
		SELECT o.plan_tier, m.type, m.config, m.interval_seconds
		FROM monitors m
		JOIN organizations o ON o.id = m.org_id
		WHERE m.id = $1 AND m.org_id = $2
	`, id, orgID).Scan(&planTier, &currentType, &currentConfig, &currentInterval); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	effectiveConfig := currentConfig
	if req.Config != nil {
		effectiveConfig = req.Config
	}
	effectiveInterval := currentInterval
	if req.IntervalSeconds != nil {
		effectiveInterval = *req.IntervalSeconds
	}
	minInterval := services.PlanMinIntervalForMonitor(planTier, currentType, effectiveConfig)
	if strings.ToLower(currentType) == "domain" && effectiveInterval < 86400 {
		c.JSON(http.StatusForbidden, gin.H{"error": "interval below plan minimum", "code": "INTERVAL_QUOTA", "minInterval": 86400})
		return
	}
	if strings.ToLower(currentType) != "domain" && effectiveInterval < minInterval {
		c.JSON(http.StatusForbidden, gin.H{"error": "interval below plan minimum", "code": "INTERVAL_QUOTA", "minInterval": minInterval})
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
		interval := *req.IntervalSeconds
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET interval_seconds = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, interval, id, orgID)
	}
	if req.Regions != nil {
		regions := services.ParseRegions(req.Regions)
		if len(regions) > services.PlanMaxRegions(planTier) {
			c.JSON(http.StatusForbidden, gin.H{"error": "region limit exceeded", "code": "REGION_QUOTA_EXCEEDED"})
			return
		}
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE monitors SET regions = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, req.Regions, id, orgID)
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

	tr := parseTimeRange(c)
	page, limit, offset := parsePagination(c)
	search := strings.TrimSpace(c.Query("search"))
	isUpFilter := c.Query("isUp")

	where := `monitor_id = $1 AND org_id = $2 AND checked_at >= $3 AND checked_at <= $4`
	args := []interface{}{id, orgID, tr.From, tr.To}
	argIdx := 5

	if search != "" {
		where += ` AND (COALESCE(error_message, '') ILIKE $` + strconv.Itoa(argIdx) +
			` OR CAST(COALESCE(status_code, 0) AS TEXT) LIKE $` + strconv.Itoa(argIdx) + `)`
		args = append(args, "%"+search+"%")
		argIdx++
	}
	if isUpFilter == "true" || isUpFilter == "false" {
		where += ` AND is_up = $` + strconv.Itoa(argIdx)
		args = append(args, isUpFilter == "true")
		argIdx++
	}

	var total int
	countQuery := `SELECT COUNT(*) FROM check_results WHERE ` + where
	if err := h.db.QueryRow(c.Request.Context(), countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalPages := (total + limit - 1) / limit
	if totalPages == 0 {
		totalPages = 1
	}

	dataQuery := `
		SELECT id, monitor_id, checked_at, region, status_code, response_ms, is_up, error_message, metadata
		FROM check_results WHERE ` + where + `
		ORDER BY checked_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	dataArgs := append(args, limit, offset)

	rows, err := h.db.Query(c.Request.Context(), dataQuery, dataArgs...)
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

	c.JSON(http.StatusOK, gin.H{
		"checks": results,
		"pagination": models.CheckPagination{
			Page:       page,
			PageSize:   limit,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}

func (h *MonitorHandler) GetStats(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	tr := parseTimeRange(c)
	ctx := c.Request.Context()
	bucketExpr := bucketTruncExpr(tr.Bucket)

	var summary models.MonitorStatsSummary
	_ = h.db.QueryRow(ctx, `
		SELECT
		  COUNT(*),
		  COUNT(*) FILTER (WHERE NOT is_up),
		  COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2), 100),
		  COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_up) / NULLIF(COUNT(*), 0), 2), 0)
		FROM check_results
		WHERE monitor_id = $1 AND org_id = $2 AND checked_at >= $3 AND checked_at <= $4
	`, id, orgID, tr.From, tr.To).Scan(&summary.TotalChecks, &summary.DownChecks, &summary.UptimePct, &summary.ErrorRate)

	trendQuery := `
		SELECT ` + bucketExpr + ` as bucket,
		       AVG(response_ms)::float as avg_ms,
		       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)::float as p95_ms
		FROM check_results
		WHERE monitor_id = $1 AND org_id = $2 AND checked_at >= $3 AND checked_at <= $4 AND is_up = true
		GROUP BY 1 ORDER BY 1`

	rows, err := h.db.Query(ctx, trendQuery, id, orgID, tr.From, tr.To)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var trend []models.ResponseTimePoint
	for rows.Next() {
		var p models.ResponseTimePoint
		var bucket time.Time
		if err := rows.Scan(&bucket, &p.AvgMs, &p.P95Ms); err != nil {
			continue
		}
		p.Time = bucket.Format(time.RFC3339)
		trend = append(trend, p)
	}
	if trend == nil {
		trend = []models.ResponseTimePoint{}
	}
	c.JSON(http.StatusOK, gin.H{"trend": trend, "summary": summary})
}

func (h *MonitorHandler) fetchMonitor(c *gin.Context, orgID, id string) (*models.Monitor, error) {
	var m models.Monitor
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, name, type, target_url, interval_seconds, status,
		       config, regions, last_checked_at, last_response_ms, heartbeat_token, created_at, updated_at
		FROM monitors WHERE id = $1 AND org_id = $2
	`, id, orgID).Scan(&m.ID, &m.OrgID, &m.Name, &m.Type, &m.TargetURL, &m.IntervalSeconds, &m.Status,
		&m.Config, &m.Regions, &m.LastCheckedAt, &m.LastResponseMs, &m.HeartbeatToken, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (h *MonitorHandler) Batch(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		IDs    []string `json:"ids" binding:"required"`
		Action string   `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	affected := 0
	for _, id := range req.IDs {
		switch req.Action {
		case "pause":
			res, _ := h.db.Exec(ctx, `UPDATE monitors SET status = 'paused', updated_at = now() WHERE id = $1 AND org_id = $2`, id, orgID)
			affected += int(res.RowsAffected())
		case "resume":
			res, _ := h.db.Exec(ctx, `UPDATE monitors SET status = 'pending', updated_at = now() WHERE id = $1 AND org_id = $2`, id, orgID)
			affected += int(res.RowsAffected())
		case "delete":
			res, _ := h.db.Exec(ctx, `DELETE FROM monitors WHERE id = $1 AND org_id = $2`, id, orgID)
			affected += int(res.RowsAffected())
		}
	}
	c.JSON(http.StatusOK, gin.H{"affected": affected})
}

func (h *MonitorHandler) GetArtifacts(c *gin.Context) {
	orgID := c.Param("orgId")
	id := c.Param("id")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	svc := services.NewScreenshotService(h.db, nil)
	arts, err := svc.ListForMonitor(c.Request.Context(), orgID, id, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if arts == nil {
		arts = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"artifacts": arts})
}

func (h *MonitorHandler) CaptureBaseline(c *gin.Context) {
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

	m, err := h.fetchMonitor(c, orgID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	ctx := c.Request.Context()
	cfg := m.Config
	if cfg == nil {
		cfg = json.RawMessage(`{}`)
	}

	var patch map[string]interface{}
	switch strings.ToLower(m.Type) {
	case "dns":
		patch, err = services.CaptureDNSBaseline(ctx, m.TargetURL, cfg)
	case "tamper":
		patch, err = services.CaptureTamperBaseline(ctx, m.TargetURL, cfg)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "baseline capture not supported for this monitor type"})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	base := map[string]interface{}{}
	_ = json.Unmarshal(cfg, &base)
	for k, v := range patch {
		base[k] = v
	}
	merged, _ := json.Marshal(base)
	_, err = h.db.Exec(ctx, `UPDATE monitors SET config = $1::jsonb, updated_at = now() WHERE id = $2 AND org_id = $3`, string(merged), id, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updated, _ := h.fetchMonitor(c, orgID, id)
	c.JSON(http.StatusOK, gin.H{"monitor": updated, "baseline": patch})
}
