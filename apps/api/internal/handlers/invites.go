package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/services"
)

type InviteHandler struct {
	db *pgxpool.Pool
}

func NewInviteHandler(db *pgxpool.Pool) *InviteHandler {
	return &InviteHandler{db: db}
}

func (h *InviteHandler) verifyOrgAdmin(c *gin.Context, orgID string) bool {
	userID := GetUserID(c)
	var role string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT role FROM organization_members WHERE user_id = $1 AND org_id = $2
	`, userID, orgID).Scan(&role)
	return err == nil && (role == "owner" || role == "admin")
}

func (h *InviteHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	if !h.verifyOrgAdmin(c, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, email, role, expires_at, accepted_at, created_at
		FROM org_invitations WHERE org_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type invite struct {
		ID         string     `json:"id"`
		Email      string     `json:"email"`
		Role       string     `json:"role"`
		ExpiresAt  time.Time  `json:"expiresAt"`
		AcceptedAt *time.Time `json:"acceptedAt,omitempty"`
		CreatedAt  time.Time  `json:"createdAt"`
	}
	var list []invite
	for rows.Next() {
		var inv invite
		if err := rows.Scan(&inv.ID, &inv.Email, &inv.Role, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt); err != nil {
			continue
		}
		list = append(list, inv)
	}
	if list == nil {
		list = []invite{}
	}
	c.JSON(http.StatusOK, gin.H{"invitations": list})
}

func (h *InviteHandler) Create(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	if !h.verifyOrgAdmin(c, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		Email string `json:"email" binding:"required"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role := strings.ToLower(req.Role)
	if role == "" {
		role = "member"
	}
	if role != "member" && role != "admin" && role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	token, _ := services.GenerateToken(32)
	tokenHash := services.HashToken(token)
	id := uuid.New().String()
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO org_invitations (id, org_id, email, role, token_hash, expires_at, invited_by)
		VALUES ($1, $2, $3, $4::member_role, $5, now() + interval '7 days', $6)
	`, id, orgID, strings.ToLower(req.Email), role, tokenHash, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "token": token, "acceptUrl": fmt.Sprintf("/invite/%s", token)})
}

func (h *InviteHandler) Accept(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash := services.HashToken(req.Token)
	var id, orgID, email, role string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, org_id, email, role::text FROM org_invitations
		WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
	`, hash).Scan(&id, &orgID, &email, &role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired invite"})
		return
	}
	var userEmail string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&userEmail)
	if strings.ToLower(userEmail) != strings.ToLower(email) {
		c.JSON(http.StatusForbidden, gin.H{"error": "invite email mismatch"})
		return
	}
	_, _ = h.db.Exec(c.Request.Context(), `
		INSERT INTO organization_members (id, org_id, user_id, role)
		VALUES ($1, $2, $3, $4::member_role)
		ON CONFLICT (user_id, org_id) DO NOTHING
	`, uuid.New().String(), orgID, userID, role)
	_, _ = h.db.Exec(c.Request.Context(), `UPDATE org_invitations SET accepted_at = now() WHERE id = $1`, id)
	c.JSON(http.StatusOK, gin.H{"orgId": orgID, "message": "joined"})
}

func (h *InviteHandler) ListMembers(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT u.id, u.email, u.display_name, om.role, om.joined_at
		FROM organization_members om
		JOIN users u ON u.id = om.user_id
		WHERE om.org_id = $1 ORDER BY om.joined_at
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type member struct {
		ID          string    `json:"id"`
		Email       string    `json:"email"`
		DisplayName *string   `json:"displayName,omitempty"`
		Role        string    `json:"role"`
		JoinedAt    time.Time `json:"joinedAt"`
	}
	var list []member
	for rows.Next() {
		var m member
		if err := rows.Scan(&m.ID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			continue
		}
		list = append(list, m)
	}
	if list == nil {
		list = []member{}
	}
	c.JSON(http.StatusOK, gin.H{"members": list})
}
