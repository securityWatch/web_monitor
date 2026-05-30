package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SSOHandler struct {
	db *pgxpool.Pool
}

func NewSSOHandler(db *pgxpool.Pool) *SSOHandler {
	return &SSOHandler{db: db}
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

func (h *SSOHandler) LoginStart(c *gin.Context) {
	orgSlug := c.Query("org")
	if orgSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org required"})
		return
	}
	var issuer, clientID string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT s.issuer_url, s.client_id FROM org_sso s
		JOIN organizations o ON o.id = s.org_id
		WHERE o.slug = $1 AND s.enabled = true
	`, orgSlug).Scan(&issuer, &clientID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSO not configured"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"issuerUrl": issuer,
		"clientId":  clientID,
		"message":   "Redirect user to IdP authorization endpoint with client_id and issuer",
	})
}
