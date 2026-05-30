package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
	"github.com/pulsewatch/api/internal/services"
)

type AlertHandler struct {
	db     *pgxpool.Pool
	alerts *services.AlertService
}

func NewAlertHandler(db *pgxpool.Pool, alerts *services.AlertService) *AlertHandler {
	return &AlertHandler{db: db, alerts: alerts}
}

func (h *AlertHandler) verifyOrgAccess(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	return exists
}

func (h *AlertHandler) ListChannels(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, org_id, name, type, config, enabled, created_at
		FROM alert_channels WHERE org_id = $1 ORDER BY created_at
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var channels []models.AlertChannel
	for rows.Next() {
		var ch models.AlertChannel
		if err := rows.Scan(&ch.ID, &ch.OrgID, &ch.Name, &ch.Type, &ch.Config, &ch.Enabled, &ch.CreatedAt); err != nil {
			continue
		}
		channels = append(channels, ch)
	}
	if channels == nil {
		channels = []models.AlertChannel{}
	}
	c.JSON(http.StatusOK, gin.H{"channels": channels})
}

func (h *AlertHandler) CreateChannel(c *gin.Context) {
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
		Name    string          `json:"name" binding:"required"`
		Type    string          `json:"type" binding:"required"`
		Config  json.RawMessage `json:"config"`
		Enabled      *bool           `json:"enabled"`
		DelayMinutes *int            `json:"delayMinutes"`
		EventType    string          `json:"eventType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	chType := strings.ToLower(req.Type)
	valid := map[string]bool{
		"email": true, "webhook": true, "slack": true, "discord": true,
		"pagerduty": true, "teams": true, "sms": true,
		"dingtalk": true, "feishu": true, "wecom": true,
	}
	if !valid[chType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel type"})
		return
	}
	if req.Config == nil {
		req.Config = json.RawMessage(`{}`)
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	delayMinutes := 0
	if req.DelayMinutes != nil && *req.DelayMinutes >= 0 {
		delayMinutes = *req.DelayMinutes
	}

	id := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO alert_channels (id, org_id, name, type, config, enabled)
		VALUES ($1, $2, $3, $4::alert_channel_type, $5, $6)
	`, id, orgID, req.Name, chType, req.Config, enabled)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	eventType := strings.ToLower(strings.TrimSpace(req.EventType))
	validEvents := map[string]bool{
		"all": true, "down": true, "up": true, "security": true,
		"ssl_warning": true, "dns_change": true, "tamper_major_change": true, "tamper_policy_violation": true,
	}
	if !validEvents[eventType] {
		eventType = "all"
	}
	_, _ = h.db.Exec(c.Request.Context(), `
		INSERT INTO alert_rules (id, org_id, monitor_id, channel_id, event_type, enabled, delay_minutes)
		VALUES ($1, $2, NULL, $3, $4, true, $5)
	`, uuid.New().String(), orgID, id, eventType, delayMinutes)

	ch, _ := h.fetchChannel(c, orgID, id)
	c.JSON(http.StatusCreated, ch)
}

func (h *AlertHandler) UpdateChannel(c *gin.Context) {
	orgID := c.Param("orgId")
	channelID := c.Param("channelId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req struct {
		Name    *string         `json:"name"`
		Config  json.RawMessage `json:"config"`
		Enabled *bool           `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE alert_channels SET name = $1 WHERE id = $2 AND org_id = $3`, *req.Name, channelID, orgID)
	}
	if req.Config != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE alert_channels SET config = $1 WHERE id = $2 AND org_id = $3`, req.Config, channelID, orgID)
	}
	if req.Enabled != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE alert_channels SET enabled = $1 WHERE id = $2 AND org_id = $3`, *req.Enabled, channelID, orgID)
	}

	ch, err := h.fetchChannel(c, orgID, channelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, ch)
}

func (h *AlertHandler) DeleteChannel(c *gin.Context) {
	orgID := c.Param("orgId")
	channelID := c.Param("channelId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	res, err := h.db.Exec(c.Request.Context(), `DELETE FROM alert_channels WHERE id = $1 AND org_id = $2`, channelID, orgID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *AlertHandler) TestChannel(c *gin.Context) {
	orgID := c.Param("orgId")
	channelID := c.Param("channelId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := h.alerts.SendTest(c.Request.Context(), orgID, channelID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "test alert sent"})
}

func (h *AlertHandler) fetchChannel(c *gin.Context, orgID, id string) (*models.AlertChannel, error) {
	var ch models.AlertChannel
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, name, type, config, enabled, created_at
		FROM alert_channels WHERE id = $1 AND org_id = $2
	`, id, orgID).Scan(&ch.ID, &ch.OrgID, &ch.Name, &ch.Type, &ch.Config, &ch.Enabled, &ch.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}
