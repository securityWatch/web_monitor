package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/models"
	"github.com/pulsewatch/api/internal/services"
)

type MeHandler struct {
	db   *pgxpool.Pool
	auth *services.AuthService
	totp *services.TOTPService
}

func NewMeHandler(db *pgxpool.Pool, auth *services.AuthService, totp *services.TOTPService) *MeHandler {
	return &MeHandler{db: db, auth: auth, totp: totp}
}

func (h *MeHandler) GetMe(c *gin.Context) {
	userID := GetUserID(c)
	ctx := c.Request.Context()

	var user models.User
	err := h.db.QueryRow(ctx, `
		SELECT id, email, display_name, avatar_url, timezone, locale, email_verified_at,
		       notify_incidents, COALESCE(notify_daily, false), notify_weekly, notify_product, notify_ssl,
		       COALESCE(is_admin, false), onboarding_done, created_at
		FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.Timezone, &user.Locale,
		&user.EmailVerifiedAt, &user.NotifyIncidents, &user.NotifyDaily, &user.NotifyWeekly, &user.NotifyProduct, &user.NotifySSL, &user.IsAdmin, &user.OnboardingDone, &user.CreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT o.id, o.name, o.slug, o.plan_tier, o.monitor_quota, o.seat_quota, o.founding_member, om.role
		FROM organizations o
		JOIN organization_members om ON om.org_id = o.id
		WHERE om.user_id = $1
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type orgWithRole struct {
		models.Organization
		Role string `json:"role"`
	}
	var orgs []orgWithRole
	for rows.Next() {
		var o orgWithRole
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.PlanTier, &o.MonitorQuota, &o.SeatQuota, &o.FoundingMember, &o.Role); err != nil {
			continue
		}
		orgs = append(orgs, o)
	}

	c.JSON(http.StatusOK, gin.H{"user": user, "organizations": orgs})
}

func (h *MeHandler) UpdateProfile(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		DisplayName *string `json:"displayName"`
		Timezone    *string `json:"timezone"`
		Locale      *string `json:"locale"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.DisplayName != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2`, *req.DisplayName, userID)
	}
	if req.Timezone != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET timezone = $1, updated_at = now() WHERE id = $2`, *req.Timezone, userID)
	}
	if req.Locale != nil {
		loc := strings.ToLower(*req.Locale)
		if loc == "zh-cn" || loc == "zh" {
			loc = "zh"
		} else {
			loc = "en"
		}
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET locale = $1, updated_at = now() WHERE id = $2`, loc, userID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}

func (h *MeHandler) ChangePassword(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		CurrentPassword string `json:"currentPassword" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := services.ValidatePassword(req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var passHash string
	err := h.db.QueryRow(c.Request.Context(), `SELECT COALESCE(password_hash,'') FROM users WHERE id = $1`, userID).Scan(&passHash)
	if err != nil || !services.CheckPassword(passHash, req.CurrentPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		return
	}

	newHash, _ := services.HashPassword(req.NewPassword)
	_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, newHash, userID)
	_, _ = h.db.Exec(c.Request.Context(), `DELETE FROM sessions WHERE user_id = $1`, userID)

	c.JSON(http.StatusOK, gin.H{"message": "password changed"})
}

func (h *MeHandler) SetPassword(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		NewPassword string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := services.ValidatePassword(req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newHash, _ := services.HashPassword(req.NewPassword)
	_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, newHash, userID)
	c.JSON(http.StatusOK, gin.H{"message": "password set"})
}

func (h *MeHandler) ChangeEmailRequest(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		NewEmail        string `json:"newEmail" binding:"required"`
		CurrentPassword string `json:"currentPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.NewEmail = strings.ToLower(strings.TrimSpace(req.NewEmail))
	if !services.ValidateEmail(req.NewEmail) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
		return
	}

	var passHash string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT COALESCE(password_hash,'') FROM users WHERE id = $1`, userID).Scan(&passHash)
	if !services.CheckPassword(passHash, req.CurrentPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		return
	}

	token, _ := services.GenerateToken(32)
	tokenHash := services.HashToken(token)
	_, _ = h.db.Exec(c.Request.Context(), `
		INSERT INTO email_change_tokens (id, user_id, new_email, token_hash, expires_at)
		VALUES ($1, $2, $3, $4, now() + interval '24 hours')
	`, uuid.New().String(), userID, req.NewEmail, tokenHash)

	c.JSON(http.StatusOK, gin.H{"message": "confirmation sent to new email", "token": token})
}

func (h *MeHandler) ConfirmEmailChange(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash := services.HashToken(req.Token)
	var userID, newEmail string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT user_id, new_email FROM email_change_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, hash).Scan(&userID, &newEmail)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired token"})
		return
	}

	_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET email = $1, updated_at = now() WHERE id = $2`, newEmail, userID)
	_, _ = h.db.Exec(c.Request.Context(), `UPDATE email_change_tokens SET used_at = now() WHERE token_hash = $1`, hash)

	c.JSON(http.StatusOK, gin.H{"message": "email updated"})
}

func (h *MeHandler) UpdateNotifications(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		NotifyIncidents *bool `json:"notifyIncidents"`
		NotifyDaily     *bool `json:"notifyDaily"`
		NotifyWeekly    *bool `json:"notifyWeekly"`
		NotifyProduct   *bool `json:"notifyProduct"`
		NotifySSL       *bool `json:"notifySsl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.NotifyIncidents != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET notify_incidents = $1 WHERE id = $2`, *req.NotifyIncidents, userID)
	}
	if req.NotifyDaily != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET notify_daily = $1 WHERE id = $2`, *req.NotifyDaily, userID)
	}
	if req.NotifyWeekly != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET notify_weekly = $1 WHERE id = $2`, *req.NotifyWeekly, userID)
	}
	if req.NotifyProduct != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET notify_product = $1 WHERE id = $2`, *req.NotifyProduct, userID)
	}
	if req.NotifySSL != nil {
		_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET notify_ssl = $1 WHERE id = $2`, *req.NotifySSL, userID)
	}
	c.JSON(http.StatusOK, gin.H{"message": "notifications updated"})
}

func (h *MeHandler) FoundingCount(c *gin.Context) {
	var count int
	_ = h.db.QueryRow(c.Request.Context(), `SELECT count FROM founding_counter WHERE id = 1`).Scan(&count)
	c.JSON(http.StatusOK, gin.H{"remaining": count, "total": 5000})
}

func (h *MeHandler) CompleteOnboarding(c *gin.Context) {
	userID := GetUserID(c)
	_, _ = h.db.Exec(c.Request.Context(), `UPDATE users SET onboarding_done = true, updated_at = now() WHERE id = $1`, userID)
	c.JSON(http.StatusOK, gin.H{"message": "onboarding completed"})
}

func (h *MeHandler) ResendVerification(c *gin.Context) {
	userID := GetUserID(c)
	if err := h.auth.ResendVerification(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "verification email sent"})
}

func (h *MeHandler) SwitchOrg(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		OrgID string `json:"orgId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.auth.SwitchOrg(c.Request.Context(), userID, req.OrgID, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	services.LogAudit(c.Request.Context(), h.db, req.OrgID, userID, "org.switch", c.ClientIP(), nil)
	c.JSON(http.StatusOK, resp)
}

func (h *MeHandler) TotpStatus(c *gin.Context) {
	enabled := h.totp.IsEnabled(c.Request.Context(), GetUserID(c))
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

func (h *MeHandler) TotpSetup(c *gin.Context) {
	userID := GetUserID(c)
	var email string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	secret, uri, err := h.totp.Setup(c.Request.Context(), userID, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"secret": secret, "uri": uri})
}

func (h *MeHandler) TotpEnable(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.totp.Enable(c.Request.Context(), userID, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	services.LogAudit(c.Request.Context(), h.db, GetOrgID(c), userID, "totp.enable", c.ClientIP(), nil)
	c.JSON(http.StatusOK, gin.H{"message": "2FA enabled"})
}

func (h *MeHandler) TotpDisable(c *gin.Context) {
	userID := GetUserID(c)
	h.totp.Disable(c.Request.Context(), userID)
	services.LogAudit(c.Request.Context(), h.db, GetOrgID(c), userID, "totp.disable", c.ClientIP(), nil)
	c.JSON(http.StatusOK, gin.H{"message": "2FA disabled"})
}

func (h *MeHandler) ListSessions(c *gin.Context) {
	userID := GetUserID(c)
	currentHash := ""
	if raw := c.Query("refreshToken"); raw != "" {
		currentHash = services.HashToken(raw)
	}
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, user_agent, host(ip_address)::text, created_at, expires_at, refresh_hash
		FROM sessions
		WHERE user_id = $1 AND expires_at > now()
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type sessionRow struct {
		ID        string    `json:"id"`
		UserAgent *string   `json:"userAgent,omitempty"`
		IPAddress *string   `json:"ipAddress,omitempty"`
		CreatedAt time.Time `json:"createdAt"`
		ExpiresAt time.Time `json:"expiresAt"`
		IsCurrent bool      `json:"isCurrent"`
	}
	var list []sessionRow
	for rows.Next() {
		var s sessionRow
		var ua, ip *string
		var refreshHash string
		if err := rows.Scan(&s.ID, &ua, &ip, &s.CreatedAt, &s.ExpiresAt, &refreshHash); err != nil {
			continue
		}
		s.UserAgent = ua
		s.IPAddress = ip
		s.IsCurrent = currentHash != "" && refreshHash == currentHash
		list = append(list, s)
	}
	if list == nil {
		list = []sessionRow{}
	}
	c.JSON(http.StatusOK, gin.H{"sessions": list})
}

func (h *MeHandler) RevokeSession(c *gin.Context) {
	userID := GetUserID(c)
	sessionID := c.Param("id")
	res, err := h.db.Exec(c.Request.Context(), `
		DELETE FROM sessions WHERE id = $1 AND user_id = $2
	`, sessionID, userID)
	if err != nil || res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "session revoked"})
}

func (h *MeHandler) RevokeOtherSessions(c *gin.Context) {
	userID := GetUserID(c)
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	currentHash := services.HashToken(req.RefreshToken)
	_, _ = h.db.Exec(c.Request.Context(), `
		DELETE FROM sessions WHERE user_id = $1 AND refresh_hash <> $2
	`, userID, currentHash)
	c.JSON(http.StatusOK, gin.H{"message": "other sessions revoked"})
}
