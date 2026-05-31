package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
	"github.com/pulsewatch/api/internal/services"
)

type IncidentHandler struct {
	db        *pgxpool.Pool
	incidents *services.IncidentService
}

func NewIncidentHandler(db *pgxpool.Pool, incidents *services.IncidentService) *IncidentHandler {
	return &IncidentHandler{db: db, incidents: incidents}
}

func (h *IncidentHandler) AISummary(c *gin.Context) {
	orgID := c.Param("orgId")
	incidentID := c.Param("incidentId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	if !h.verifyOrgAccess(c, orgID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var inc models.Incident
	err := h.db.QueryRow(ctx, `
		SELECT i.id, i.org_id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.status, i.severity, i.message,
		       COALESCE(i.title, m.name), COALESCE(i.workflow_status, 'investigating'), i.assignee_id, i.post_mortem
		FROM incidents i JOIN monitors m ON m.id = i.monitor_id
		WHERE i.id = $1 AND i.org_id = $2
	`, incidentID, orgID).Scan(&inc.ID, &inc.OrgID, &inc.MonitorID, &inc.MonitorName, &inc.StartedAt, &inc.ResolvedAt, &inc.Status, &inc.Severity, &inc.Message, &inc.Title, &inc.WorkflowStatus, &inc.AssigneeID, &inc.PostMortem)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var planTier string
	_ = h.db.QueryRow(ctx, `SELECT plan_tier FROM organizations WHERE id = $1`, orgID).Scan(&planTier)
	if err := services.CheckAIQuota(ctx, h.db, orgID, planTier, "incident_summary"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "AI_QUOTA_EXCEEDED"})
		return
	}

	summary, err := h.incidents.GenerateAndStoreAISummary(ctx, incidentID, orgID, &userID)
	if err != nil {
		services.RecordAIUsage(ctx, h.db, orgID, "incident_summary", "error", err.Error())
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "code": "AI_UNAVAILABLE"})
		return
	}
	services.RecordAIUsage(ctx, h.db, orgID, "incident_summary", "ok", "")
	c.JSON(http.StatusOK, gin.H{"summary": summary, "postMortem": services.FormatIncidentPostMortem(summary)})
}

func (h *IncidentHandler) verifyOrgAccess(c *gin.Context, orgID, userID string) bool {
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)`, userID, orgID).Scan(&exists)
	return exists
}

func (h *IncidentHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	if !h.verifyOrgAccess(c, orgID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	status := c.Query("status")
	query := `
		SELECT i.id, i.org_id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.status, i.severity, i.message,
		       COALESCE(i.title, m.name), COALESCE(i.workflow_status, 'investigating'), i.assignee_id
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
		if err := rows.Scan(&inc.ID, &inc.OrgID, &inc.MonitorID, &inc.MonitorName, &inc.StartedAt, &inc.ResolvedAt, &inc.Status, &inc.Severity, &inc.Message, &inc.Title, &inc.WorkflowStatus, &inc.AssigneeID); err != nil {
			continue
		}
		incidents = append(incidents, inc)
	}
	if incidents == nil {
		incidents = []models.Incident{}
	}
	c.JSON(http.StatusOK, gin.H{"incidents": incidents})
}

func (h *IncidentHandler) Get(c *gin.Context) {
	orgID := c.Param("orgId")
	incidentID := c.Param("incidentId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	if !h.verifyOrgAccess(c, orgID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var inc models.Incident
	err := h.db.QueryRow(ctx, `
		SELECT i.id, i.org_id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.status, i.severity, i.message,
		       COALESCE(i.title, m.name), COALESCE(i.workflow_status, 'investigating'), i.assignee_id, i.post_mortem
		FROM incidents i JOIN monitors m ON m.id = i.monitor_id
		WHERE i.id = $1 AND i.org_id = $2
	`, incidentID, orgID).Scan(&inc.ID, &inc.OrgID, &inc.MonitorID, &inc.MonitorName, &inc.StartedAt, &inc.ResolvedAt, &inc.Status, &inc.Severity, &inc.Message, &inc.Title, &inc.WorkflowStatus, &inc.AssigneeID, &inc.PostMortem)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	rows, _ := h.db.Query(ctx, `
		SELECT m.id, m.name FROM incident_monitors im JOIN monitors m ON m.id = im.monitor_id WHERE im.incident_id = $1
	`, incidentID)
	type aff struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var affected []aff
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var a aff
			if rows.Scan(&a.ID, &a.Name) == nil {
				affected = append(affected, a)
			}
		}
	}

	tlRows, _ := h.db.Query(ctx, `
		SELECT t.id, t.kind, t.message, t.created_at, u.email
		FROM incident_timeline t LEFT JOIN users u ON u.id = t.user_id
		WHERE t.incident_id = $1 ORDER BY t.created_at ASC
	`, incidentID)
	type tlEntry struct {
		ID        string    `json:"id"`
		Kind      string    `json:"kind"`
		Message   string    `json:"message"`
		CreatedAt time.Time `json:"createdAt"`
		UserEmail *string   `json:"userEmail,omitempty"`
	}
	var timeline []tlEntry
	if tlRows != nil {
		defer tlRows.Close()
		for tlRows.Next() {
			var e tlEntry
			if tlRows.Scan(&e.ID, &e.Kind, &e.Message, &e.CreatedAt, &e.UserEmail) == nil {
				timeline = append(timeline, e)
			}
		}
	}
	if timeline == nil {
		timeline = []tlEntry{}
	}
	if affected == nil {
		affected = []aff{}
	}

	c.JSON(http.StatusOK, gin.H{"incident": inc, "affectedMonitors": affected, "timeline": timeline})
}

func (h *IncidentHandler) Update(c *gin.Context) {
	orgID := c.Param("orgId")
	incidentID := c.Param("incidentId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	if !h.verifyOrgAccess(c, orgID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var req struct {
		WorkflowStatus *string `json:"workflowStatus"`
		AssigneeID     *string `json:"assigneeId"`
		PostMortem     *string `json:"postMortem"`
		Status         *string `json:"status"`
		SyncStatusPage *bool   `json:"syncStatusPage"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.WorkflowStatus != nil {
		_, _ = h.db.Exec(ctx, `UPDATE incidents SET workflow_status = $1 WHERE id = $2 AND org_id = $3`, *req.WorkflowStatus, incidentID, orgID)
		h.incidents.AddTimeline(ctx, incidentID, "status_change", "Workflow: "+*req.WorkflowStatus, &userID)
	}
	if req.AssigneeID != nil {
		_, _ = h.db.Exec(ctx, `UPDATE incidents SET assignee_id = NULLIF($1,'') WHERE id = $2 AND org_id = $3`, *req.AssigneeID, incidentID, orgID)
		h.incidents.AddTimeline(ctx, incidentID, "assigned", "Incident assigned", &userID)
	}
	if req.PostMortem != nil {
		_, _ = h.db.Exec(ctx, `UPDATE incidents SET post_mortem = $1 WHERE id = $2 AND org_id = $3`, *req.PostMortem, incidentID, orgID)
	}
	if req.SyncStatusPage != nil {
		_, _ = h.db.Exec(ctx, `UPDATE incidents SET sync_status_page = $1 WHERE id = $2 AND org_id = $3`, *req.SyncStatusPage, incidentID, orgID)
	}
	if req.Status != nil && *req.Status == "resolved" {
		_, _ = h.db.Exec(ctx, `UPDATE incidents SET status = 'resolved', resolved_at = now(), workflow_status = 'resolved' WHERE id = $1 AND org_id = $2`, incidentID, orgID)
		h.incidents.AddTimeline(ctx, incidentID, "resolved", "Incident resolved manually", &userID)
		if _, err := h.incidents.GenerateAndStoreAISummary(ctx, incidentID, orgID, &userID); err != nil {
			services.RecordAIUsage(ctx, h.db, orgID, "incident_summary_auto", "error", err.Error())
		} else {
			services.RecordAIUsage(ctx, h.db, orgID, "incident_summary_auto", "ok", "")
		}
		_, _ = h.db.Exec(ctx, `UPDATE status_page_incidents SET resolved_at = now() WHERE incident_id = $1 AND resolved_at IS NULL`, incidentID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *IncidentHandler) AddNote(c *gin.Context) {
	orgID := c.Param("orgId")
	incidentID := c.Param("incidentId")
	userID := GetUserID(c)
	ctx := c.Request.Context()
	if !h.verifyOrgAccess(c, orgID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.incidents.AddTimeline(ctx, incidentID, "note", req.Message, &userID)
	c.JSON(http.StatusCreated, gin.H{"message": "note added"})
}
