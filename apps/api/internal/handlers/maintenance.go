package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MaintenanceHandler struct {
	db *pgxpool.Pool
}

func NewMaintenanceHandler(db *pgxpool.Pool) *MaintenanceHandler {
	return &MaintenanceHandler{db: db}
}

func (h *MaintenanceHandler) verifyOrgAccess(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	return exists
}

type maintenanceWindow struct {
	ID        string     `json:"id"`
	OrgID     string     `json:"orgId"`
	MonitorID *string    `json:"monitorId,omitempty"`
	Name      string     `json:"name"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    time.Time  `json:"endsAt"`
	Message   *string    `json:"message,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

func (h *MaintenanceHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, org_id, monitor_id, name, starts_at, ends_at, message, created_at
		FROM maintenance_windows WHERE org_id = $1 ORDER BY starts_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []maintenanceWindow
	for rows.Next() {
		var w maintenanceWindow
		if err := rows.Scan(&w.ID, &w.OrgID, &w.MonitorID, &w.Name, &w.StartsAt, &w.EndsAt, &w.Message, &w.CreatedAt); err != nil {
			continue
		}
		list = append(list, w)
	}
	if list == nil {
		list = []maintenanceWindow{}
	}
	c.JSON(http.StatusOK, gin.H{"windows": list})
}

func (h *MaintenanceHandler) Create(c *gin.Context) {
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
		MonitorID *string `json:"monitorId"`
		Name      string  `json:"name"`
		StartsAt  string  `json:"startsAt" binding:"required"`
		EndsAt    string  `json:"endsAt" binding:"required"`
		Message   string  `json:"message"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	starts, err1 := time.Parse(time.RFC3339, req.StartsAt)
	ends, err2 := time.Parse(time.RFC3339, req.EndsAt)
	if err1 != nil || err2 != nil || !ends.After(starts) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid time range"})
		return
	}
	name := req.Name
	if name == "" {
		name = "Maintenance"
	}
	id := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO maintenance_windows (id, org_id, monitor_id, name, starts_at, ends_at, message)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))
	`, id, orgID, req.MonitorID, name, starts, ends, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *MaintenanceHandler) Delete(c *gin.Context) {
	orgID := c.Param("orgId")
	windowID := c.Param("windowId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	res, err := h.db.Exec(c.Request.Context(), `DELETE FROM maintenance_windows WHERE id = $1 AND org_id = $2`, windowID, orgID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
