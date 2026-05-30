package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OnCallHandler struct {
	db *pgxpool.Pool
}

func NewOnCallHandler(db *pgxpool.Pool) *OnCallHandler {
	return &OnCallHandler{db: db}
}

func (h *OnCallHandler) ListSchedules(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, name, timezone, escalation_minutes, enabled FROM on_call_schedules WHERE org_id = $1 ORDER BY created_at
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type schedule struct {
		ID                 string `json:"id"`
		Name               string `json:"name"`
		Timezone           string `json:"timezone"`
		EscalationMinutes  int    `json:"escalationMinutes"`
		Enabled            bool   `json:"enabled"`
	}
	var list []schedule
	for rows.Next() {
		var s schedule
		if rows.Scan(&s.ID, &s.Name, &s.Timezone, &s.EscalationMinutes, &s.Enabled) == nil {
			list = append(list, s)
		}
	}
	if list == nil {
		list = []schedule{}
	}
	c.JSON(http.StatusOK, gin.H{"schedules": list})
}

func (h *OnCallHandler) CreateSchedule(c *gin.Context) {
	orgID := c.Param("orgId")
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		Name              string `json:"name" binding:"required"`
		Timezone          string `json:"timezone"`
		EscalationMinutes int    `json:"escalationMinutes"`
		UserIDs           []string `json:"userIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}
	if req.EscalationMinutes <= 0 {
		req.EscalationMinutes = 15
	}

	scheduleID := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO on_call_schedules (id, org_id, name, timezone, escalation_minutes)
		VALUES ($1, $2, $3, $4, $5)
	`, scheduleID, orgID, req.Name, req.Timezone, req.EscalationMinutes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i, uid := range req.UserIDs {
		_, _ = h.db.Exec(c.Request.Context(), `
			INSERT INTO on_call_rotations (id, schedule_id, user_id, position, escalation_level)
			VALUES ($1, $2, $3, $4, 1)
		`, uuid.New().String(), scheduleID, uid, i)
	}
	c.JSON(http.StatusCreated, gin.H{"id": scheduleID})
}

func (h *OnCallHandler) GetRotations(c *gin.Context) {
	orgID := c.Param("orgId")
	scheduleID := c.Param("scheduleId")
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT r.user_id, u.email, u.display_name, r.position, r.escalation_level
		FROM on_call_rotations r
		JOIN on_call_schedules s ON s.id = r.schedule_id
		JOIN users u ON u.id = r.user_id
		WHERE s.org_id = $1 AND r.schedule_id = $2
		ORDER BY r.position
	`, orgID, scheduleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type rot struct {
		UserID    string  `json:"userId"`
		Email     string  `json:"email"`
		Name      *string `json:"displayName"`
		Position  int     `json:"position"`
		Level     int     `json:"escalationLevel"`
	}
	var list []rot
	for rows.Next() {
		var r rot
		if rows.Scan(&r.UserID, &r.Email, &r.Name, &r.Position, &r.Level) == nil {
			list = append(list, r)
		}
	}
	if list == nil {
		list = []rot{}
	}
	c.JSON(http.StatusOK, gin.H{"rotations": list})
}

func (h *OnCallHandler) Ack(c *gin.Context) {
	orgID := c.Param("orgId")
	alertID := c.Param("alertId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	res, err := h.db.Exec(ctx, `
		UPDATE on_call_alerts SET acked_at = now()
		WHERE id = $1 AND org_id = $2 AND acked_at IS NULL
	`, alertID, orgID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_ = userID
	c.JSON(http.StatusOK, gin.H{"message": "acknowledged"})
}

func (h *OnCallHandler) PendingAlerts(c *gin.Context) {
	orgID := c.Param("orgId")
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT oca.id, oca.incident_id, oca.escalation_level, oca.created_at, oca.acked_at,
		       i.title, u.email
		FROM on_call_alerts oca
		JOIN incidents i ON i.id = oca.incident_id
		LEFT JOIN users u ON u.id = oca.user_id
		WHERE oca.org_id = $1
		ORDER BY oca.created_at DESC LIMIT 50
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type alertRow struct {
		ID        string  `json:"id"`
		IncidentID string `json:"incidentId"`
		Level     int     `json:"escalationLevel"`
		CreatedAt string  `json:"createdAt"`
		AckedAt   *string `json:"ackedAt,omitempty"`
		Title     string  `json:"title"`
		Assignee  *string `json:"assigneeEmail,omitempty"`
	}
	var list []alertRow
	for rows.Next() {
		var a alertRow
		var created time.Time
		var acked *time.Time
		if rows.Scan(&a.ID, &a.IncidentID, &a.Level, &created, &acked, &a.Title, &a.Assignee) == nil {
			a.CreatedAt = created.Format(time.RFC3339)
			if acked != nil {
				s := acked.Format(time.RFC3339)
				a.AckedAt = &s
			}
			list = append(list, a)
		}
	}
	if list == nil {
		list = []alertRow{}
	}
	c.JSON(http.StatusOK, gin.H{"alerts": list})
}
