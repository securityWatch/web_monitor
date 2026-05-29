package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
)

var slugRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

type StatusPageHandler struct {
	db *pgxpool.Pool
}

func NewStatusPageHandler(db *pgxpool.Pool) *StatusPageHandler {
	return &StatusPageHandler{db: db}
}

func (h *StatusPageHandler) verifyOrgAccess(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	return exists
}

func (h *StatusPageHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, org_id, name, slug, is_public, created_at, updated_at
		FROM status_pages WHERE org_id = $1 ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var pages []models.StatusPage
	for rows.Next() {
		var p models.StatusPage
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.IsPublic, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		pages = append(pages, p)
	}
	if pages == nil {
		pages = []models.StatusPage{}
	}
	c.JSON(http.StatusOK, gin.H{"statusPages": pages})
}

func (h *StatusPageHandler) Create(c *gin.Context) {
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
		Name      string   `json:"name" binding:"required"`
		Slug      string   `json:"slug" binding:"required"`
		IsPublic  *bool    `json:"isPublic"`
		MonitorIDs []string `json:"monitorIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	if !slugRe.MatchString(slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid slug"})
		return
	}
	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}

	id := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO status_pages (id, org_id, name, slug, is_public)
		VALUES ($1, $2, $3, $4, $5)
	`, id, orgID, req.Name, slug, isPublic)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "slug already exists"})
		return
	}

	for i, mid := range req.MonitorIDs {
		_, _ = h.db.Exec(c.Request.Context(), `
			INSERT INTO status_page_monitors (id, status_page_id, monitor_id, sort_order)
			VALUES ($1, $2, $3, $4)
		`, uuid.New().String(), id, mid, i)
	}

	p, _ := h.fetchPage(c, orgID, id)
	c.JSON(http.StatusCreated, p)
}

func (h *StatusPageHandler) Update(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req struct {
		Name       *string  `json:"name"`
		IsPublic   *bool    `json:"isPublic"`
		MonitorIDs []string `json:"monitorIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE status_pages SET name = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, *req.Name, pageID, orgID)
	}
	if req.IsPublic != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE status_pages SET is_public = $1, updated_at = now() WHERE id = $2 AND org_id = $3`, *req.IsPublic, pageID, orgID)
	}
	if req.MonitorIDs != nil {
		_, _ = h.db.Exec(c.Request.Context(), `DELETE FROM status_page_monitors WHERE status_page_id = $1`, pageID)
		for i, mid := range req.MonitorIDs {
			_, _ = h.db.Exec(c.Request.Context(), `
				INSERT INTO status_page_monitors (id, status_page_id, monitor_id, sort_order)
				VALUES ($1, $2, $3, $4)
			`, uuid.New().String(), pageID, mid, i)
		}
	}

	p, err := h.fetchPage(c, orgID, pageID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *StatusPageHandler) Delete(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if GetRole(c) == "viewer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	_, _ = h.db.Exec(c.Request.Context(), `DELETE FROM status_pages WHERE id = $1 AND org_id = $2`, pageID, orgID)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *StatusPageHandler) PublicGet(c *gin.Context) {
	slug := c.Param("slug")
	ctx := c.Request.Context()

	var page models.StatusPage
	err := h.db.QueryRow(ctx, `
		SELECT id, org_id, name, slug, is_public, created_at, updated_at
		FROM status_pages WHERE slug = $1 AND is_public = true
	`, slug).Scan(&page.ID, &page.OrgID, &page.Name, &page.Slug, &page.IsPublic, &page.CreatedAt, &page.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT m.id, COALESCE(spm.display_name, m.name), m.status, m.target_url,
		       COALESCE((
		         SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2)
		         FROM check_results WHERE monitor_id = m.id AND checked_at > now() - interval '24 hours'
		       ), 100)
		FROM status_page_monitors spm
		JOIN monitors m ON m.id = spm.monitor_id
		WHERE spm.status_page_id = $1
		ORDER BY spm.sort_order, m.name
	`, page.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var components []models.StatusPageComponent
	for rows.Next() {
		var comp models.StatusPageComponent
		if err := rows.Scan(&comp.MonitorID, &comp.Name, &comp.Status, &comp.TargetURL, &comp.Uptime24h); err != nil {
			continue
		}
		components = append(components, comp)
	}
	if components == nil {
		components = []models.StatusPageComponent{}
	}

	c.JSON(http.StatusOK, gin.H{
		"name":       page.Name,
		"slug":       page.Slug,
		"components": components,
		"updatedAt":  page.UpdatedAt,
	})
}

func (h *StatusPageHandler) fetchPage(c *gin.Context, orgID, id string) (*models.StatusPageDetail, error) {
	var p models.StatusPage
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, name, slug, is_public, created_at, updated_at
		FROM status_pages WHERE id = $1 AND org_id = $2
	`, id, orgID).Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.IsPublic, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, _ := h.db.Query(c.Request.Context(), `
		SELECT monitor_id FROM status_page_monitors WHERE status_page_id = $1 ORDER BY sort_order
	`, id)
	var monitorIDs []string
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var mid string
			if rows.Scan(&mid) == nil {
				monitorIDs = append(monitorIDs, mid)
			}
		}
	}
	if monitorIDs == nil {
		monitorIDs = []string{}
	}
	return &models.StatusPageDetail{StatusPage: p, MonitorIDs: monitorIDs}, nil
}

func (h *StatusPageHandler) Get(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	p, err := h.fetchPage(c, orgID, pageID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}
