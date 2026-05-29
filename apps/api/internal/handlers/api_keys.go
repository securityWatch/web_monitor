package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/services"
)

type APIKeyHandler struct {
	db *pgxpool.Pool
}

func NewAPIKeyHandler(db *pgxpool.Pool) *APIKeyHandler {
	return &APIKeyHandler{db: db}
}

func (h *APIKeyHandler) verifyOrgAdmin(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var role string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT role FROM organization_members WHERE user_id = $1 AND org_id = $2
	`, userID, orgID).Scan(&role)
	return err == nil && (role == "owner" || role == "admin")
}

func (h *APIKeyHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAdmin(c, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, name, key_prefix, scope::text, last_used_at, expires_at, created_at
		FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type keyRow struct {
		ID         string     `json:"id"`
		Name       string     `json:"name"`
		KeyPrefix  string     `json:"keyPrefix"`
		Scope      string     `json:"scope"`
		LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
		ExpiresAt  *time.Time `json:"expiresAt,omitempty"`
		CreatedAt  time.Time  `json:"createdAt"`
	}
	var list []keyRow
	for rows.Next() {
		var k keyRow
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.Scope, &k.LastUsedAt, &k.ExpiresAt, &k.CreatedAt); err != nil {
			continue
		}
		list = append(list, k)
	}
	if list == nil {
		list = []keyRow{}
	}
	c.JSON(http.StatusOK, gin.H{"keys": list})
}

func (h *APIKeyHandler) Create(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	if !h.verifyOrgAdmin(c, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		Name  string `json:"name" binding:"required"`
		Scope string `json:"scope"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scope := req.Scope
	if scope == "" {
		scope = "read"
	}
	if scope != "read" && scope != "write" && scope != "admin" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scope"})
		return
	}
	raw, prefix, hash, err := services.GenerateAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate key"})
		return
	}
	id := uuid.New().String()
	_, err = h.db.Exec(c.Request.Context(), `
		INSERT INTO api_keys (id, org_id, name, key_prefix, key_hash, scope, created_by)
		VALUES ($1, $2, $3, $4, $5, $6::api_key_scope, $7)
	`, id, orgID, req.Name, prefix, hash, scope, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "key": raw, "keyPrefix": prefix, "scope": scope, "message": "Save this key — it won't be shown again"})
}

func (h *APIKeyHandler) Delete(c *gin.Context) {
	orgID := c.Param("orgId")
	keyID := c.Param("keyId")
	if !h.verifyOrgAdmin(c, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	res, err := h.db.Exec(c.Request.Context(), `DELETE FROM api_keys WHERE id = $1 AND org_id = $2`, keyID, orgID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
