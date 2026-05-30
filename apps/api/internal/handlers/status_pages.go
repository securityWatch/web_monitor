package handlers

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
	"github.com/pulsewatch/api/internal/services"
)

var slugRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

type StatusPageHandler struct {
	db     *pgxpool.Pool
	email  *services.EmailService
	webURL string
}

func NewStatusPageHandler(db *pgxpool.Pool, email *services.EmailService, webURL string) *StatusPageHandler {
	return &StatusPageHandler{db: db, email: email, webURL: webURL}
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
		SELECT id, org_id, name, slug, is_public, custom_domain, created_at, updated_at
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
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.IsPublic, &p.CustomDomain, &p.CreatedAt, &p.UpdatedAt); err != nil {
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
		CustomDomain *string `json:"customDomain"`
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
	if req.CustomDomain != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE status_pages SET custom_domain = NULLIF($1, ''), updated_at = now() WHERE id = $2 AND org_id = $3`, *req.CustomDomain, pageID, orgID)
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
		"name":         page.Name,
		"slug":         page.Slug,
		"components":   components,
		"updatedAt":    page.UpdatedAt,
		"incidents":    h.publicIncidents(ctx, page.ID),
		"announcements": h.publicAnnouncements(ctx, page.ID),
		"maintenance":  h.activeMaintenance(ctx, page.OrgID),
		"uptime90d":    h.uptime90d(ctx, page.ID),
	})
}

func (h *StatusPageHandler) uptime90d(ctx context.Context, pageID string) []gin.H {
	rows, err := h.db.Query(ctx, `
		SELECT date_trunc('day', cr.checked_at)::date as day,
		       ROUND(100.0 * COUNT(*) FILTER (WHERE cr.is_up) / NULLIF(COUNT(*), 0), 2) as uptime
		FROM check_results cr
		JOIN status_page_monitors spm ON spm.monitor_id = cr.monitor_id
		WHERE spm.status_page_id = $1 AND cr.checked_at > now() - interval '90 days'
		GROUP BY 1 ORDER BY 1
	`, pageID)
	if err != nil {
		return []gin.H{}
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var day time.Time
		var uptime float64
		if rows.Scan(&day, &uptime) == nil {
			list = append(list, gin.H{"date": day.Format("2006-01-02"), "uptimePct": uptime})
		}
	}
	if list == nil {
		list = []gin.H{}
	}
	return list
}

func (h *StatusPageHandler) publicAnnouncements(ctx context.Context, pageID string) []gin.H {
	rows, err := h.db.Query(ctx, `
		SELECT title, body, kind, created_at FROM status_announcements
		WHERE status_page_id = $1 AND is_published = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at IS NULL OR ends_at > now())
		ORDER BY created_at DESC LIMIT 20
	`, pageID)
	if err != nil {
		return []gin.H{}
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var title, body, kind string
		var created time.Time
		if rows.Scan(&title, &body, &kind, &created) == nil {
			list = append(list, gin.H{"title": title, "body": body, "kind": kind, "createdAt": created})
		}
	}
	if list == nil {
		list = []gin.H{}
	}
	return list
}

func (h *StatusPageHandler) activeMaintenance(ctx context.Context, orgID string) *gin.H {
	var title, note string
	var starts, ends time.Time
	err := h.db.QueryRow(ctx, `
		SELECT title, note, starts_at, ends_at FROM maintenance_windows
		WHERE org_id = $1 AND starts_at <= now() AND ends_at > now()
		ORDER BY starts_at LIMIT 1
	`, orgID).Scan(&title, &note, &starts, &ends)
	if err != nil {
		return nil
	}
	m := gin.H{"title": title, "note": note, "startsAt": starts, "endsAt": ends, "banner": "Scheduled Maintenance"}
	return &m
}

func (h *StatusPageHandler) ListAnnouncements(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, title, body, kind, is_published, created_at FROM status_announcements
		WHERE status_page_id = $1 ORDER BY created_at DESC
	`, pageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type ann struct {
		ID          string    `json:"id"`
		Title       string    `json:"title"`
		Body        string    `json:"body"`
		Kind        string    `json:"kind"`
		IsPublished bool      `json:"isPublished"`
		CreatedAt   time.Time `json:"createdAt"`
	}
	var list []ann
	for rows.Next() {
		var a ann
		if rows.Scan(&a.ID, &a.Title, &a.Body, &a.Kind, &a.IsPublished, &a.CreatedAt) == nil {
			list = append(list, a)
		}
	}
	if list == nil {
		list = []ann{}
	}
	c.JSON(http.StatusOK, gin.H{"announcements": list})
}

func (h *StatusPageHandler) CreateAnnouncement(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Title       string `json:"title" binding:"required"`
		Body        string `json:"body"`
		Kind        string `json:"kind"`
		IsPublished *bool  `json:"isPublished"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	kind := req.Kind
	if kind == "" {
		kind = "info"
	}
	pub := true
	if req.IsPublished != nil {
		pub = *req.IsPublished
	}
	id := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO status_announcements (id, status_page_id, title, body, kind, is_published)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, id, pageID, req.Title, req.Body, kind, pub)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *StatusPageHandler) DeleteAnnouncement(c *gin.Context) {
	orgID := c.Param("orgId")
	pageID := c.Param("pageId")
	annID := c.Param("announcementId")
	if !h.verifyOrgAccess(c, orgID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, err := h.db.Exec(c.Request.Context(), `
		DELETE FROM status_announcements WHERE id = $1 AND status_page_id = $2
	`, annID, pageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *StatusPageHandler) publicIncidents(ctx context.Context, pageID string) []gin.H {
	rows, err := h.db.Query(ctx, `
		SELECT spi.title, spi.impact, spi.created_at, spi.resolved_at
		FROM status_page_incidents spi
		WHERE spi.status_page_id = $1 AND spi.is_public = true
		ORDER BY spi.created_at DESC LIMIT 10
	`, pageID)
	if err != nil {
		return []gin.H{}
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var title, impact string
		var createdAt time.Time
		var resolvedAt *time.Time
		if rows.Scan(&title, &impact, &createdAt, &resolvedAt) == nil {
			status := "investigating"
			if resolvedAt != nil {
				status = "resolved"
			}
			list = append(list, gin.H{
				"title":     title,
				"impact":    impact,
				"status":    status,
				"createdAt": createdAt,
				"resolvedAt": resolvedAt,
			})
		}
	}
	if list == nil {
		list = []gin.H{}
	}
	return list
}

func (h *StatusPageHandler) PublicSubscribe(c *gin.Context) {
	slug := c.Param("slug")
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	var pageID, pageName string
	err := h.db.QueryRow(ctx, `
		SELECT id, name FROM status_pages WHERE slug = $1 AND is_public = true
	`, slug).Scan(&pageID, &pageName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	token, _ := services.GenerateToken(24)
	tokenHash := services.HashToken(token)
	_, _ = h.db.Exec(ctx, `
		INSERT INTO status_page_subscribers (id, status_page_id, email, token_hash)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (status_page_id, email) DO UPDATE SET token_hash = $4, confirmed_at = NULL
	`, uuid.New().String(), pageID, strings.ToLower(strings.TrimSpace(req.Email)), tokenHash)
	confirmURL := strings.TrimSuffix(h.webURL, "/") + "/status/" + slug + "?subscribe=" + token
	_ = h.email.SendStatusSubscribeConfirm(strings.ToLower(req.Email), confirmURL, pageName)
	c.JSON(http.StatusOK, gin.H{"message": "confirmation sent"})
}

func (h *StatusPageHandler) PublicSubscribeConfirm(c *gin.Context) {
	slug := c.Param("slug")
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	var pageID string
	err := h.db.QueryRow(ctx, `SELECT id FROM status_pages WHERE slug = $1 AND is_public = true`, slug).Scan(&pageID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	tokenHash := services.HashToken(req.Token)
	tag, err := h.db.Exec(ctx, `
		UPDATE status_page_subscribers SET confirmed_at = now()
		WHERE status_page_id = $1 AND token_hash = $2 AND confirmed_at IS NULL
	`, pageID, tokenHash)
	if err != nil || tag.RowsAffected() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "subscribed"})
}

func (h *StatusPageHandler) fetchPage(c *gin.Context, orgID, id string) (*models.StatusPageDetail, error) {
	var p models.StatusPage
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, name, slug, is_public, custom_domain, created_at, updated_at
		FROM status_pages WHERE id = $1 AND org_id = $2
	`, id, orgID).Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.IsPublic, &p.CustomDomain, &p.CreatedAt, &p.UpdatedAt)
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
