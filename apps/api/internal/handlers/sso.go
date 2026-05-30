package handlers

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/services"
)

type SSOHandler struct {
	db  *pgxpool.Pool
	sso *services.SSOService
	web string
}

func NewSSOHandler(db *pgxpool.Pool, sso *services.SSOService, webURL string) *SSOHandler {
	return &SSOHandler{db: db, sso: sso, web: webURL}
}

func (h *SSOHandler) Get(c *gin.Context) {
	orgID := c.Param("orgId")
	var issuer, clientID string
	var enabled bool
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT issuer_url, client_id, enabled FROM org_sso WHERE org_id = $1
	`, orgID).Scan(&issuer, &clientID, &enabled)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"configured": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"configured": true, "issuerUrl": issuer, "clientId": clientID, "enabled": enabled})
}

func (h *SSOHandler) Upsert(c *gin.Context) {
	orgID := c.Param("orgId")
	if GetRole(c) != "owner" && GetRole(c) != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var planTier string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT plan_tier FROM organizations WHERE id = $1`, orgID).Scan(&planTier)
	if planTier != "business" {
		c.JSON(http.StatusForbidden, gin.H{"error": "SSO requires Business plan", "code": "PLAN_REQUIRED"})
		return
	}
	var req struct {
		IssuerURL    string `json:"issuerUrl" binding:"required"`
		ClientID     string `json:"clientId" binding:"required"`
		ClientSecret string `json:"clientSecret" binding:"required"`
		Enabled      bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO org_sso (id, org_id, issuer_url, client_id, client_secret, enabled, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (org_id) DO UPDATE SET issuer_url = $3, client_id = $4, client_secret = $5, enabled = $6, updated_at = now()
	`, uuid.New().String(), orgID, req.IssuerURL, req.ClientID, req.ClientSecret, req.Enabled)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "saved"})
}

func (h *SSOHandler) Status(c *gin.Context) {
	orgSlug := c.Query("org")
	if orgSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"enabled": false})
		return
	}
	_, err := h.sso.LoadOrgBySlug(c.Request.Context(), orgSlug)
	c.JSON(http.StatusOK, gin.H{"enabled": err == nil})
}

func (h *SSOHandler) LoginStart(c *gin.Context) {
	orgSlug := c.Query("org")
	if orgSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org required", "code": "ORG_REQUIRED"})
		return
	}
	authURL, err := h.sso.AuthRedirectURL(c.Request.Context(), orgSlug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error(), "code": "SSO_NOT_CONFIGURED"})
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

func (h *SSOHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.web+"/login?error=sso")
		return
	}
	resp, redirect, err := h.sso.HandleCallback(c.Request.Context(), code, state, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.web+"/login?error=sso")
		return
	}
	if resp.RequiresTotp {
		c.Redirect(http.StatusTemporaryRedirect, h.web+"/login?totp="+url.QueryEscape(resp.TempToken))
		return
	}
	u, _ := url.Parse(redirect)
	q := u.Query()
	q.Set("accessToken", resp.AccessToken)
	q.Set("refreshToken", resp.RefreshToken)
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusTemporaryRedirect, u.String())
}

func (h *SSOHandler) Status(c *gin.Context) {
	orgSlug := c.Query("org")
	if orgSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"enabled": false, "error": "org required"})
		return
	}
	var enabled bool
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT s.enabled FROM org_sso s
		JOIN organizations o ON o.id = s.org_id
		WHERE o.slug = $1
	`, orgSlug).Scan(&enabled)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"enabled": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}
