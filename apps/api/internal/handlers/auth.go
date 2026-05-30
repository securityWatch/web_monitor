package handlers

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/services"
)

type AuthHandler struct {
	auth  *services.AuthService
	email *services.EmailService
	cfg   *config.Config
}

func NewAuthHandler(auth *services.AuthService, email *services.EmailService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{auth: auth, email: email, cfg: cfg}
}

type registerReq struct {
	Email       string `json:"email" binding:"required"`
	Password    string `json:"password" binding:"required"`
	DisplayName string `json:"displayName"`
}

type loginReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type refreshReq struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.auth.Register(c.Request.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "EMAIL_ALREADY_EXISTS"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.auth.Login(c.Request.Context(), req.Email, req.Password, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		var locked *services.AccountLockedError
		if errors.As(err, &locked) {
			c.JSON(http.StatusLocked, gin.H{
				"error":             "too many failed login attempts",
				"code":              "ACCOUNT_LOCKED",
				"retryAfterSeconds": int(locked.RetryAfter.Seconds()) + 1,
			})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials", "code": "UNAUTHORIZED"})
		return
	}
	if resp.RequiresTotp {
		c.JSON(http.StatusOK, resp)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.auth.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error(), "code": "UNAUTHORIZED"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.auth.RequestPasswordReset(c.Request.Context(), req.Email, h.cfg.WebURL)
	c.JSON(http.StatusOK, gin.H{"message": "If that email exists, a reset link has been sent"})
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.auth.ResetPassword(c.Request.Context(), req.Token, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}

func (h *AuthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "pulsewatch-api"})
}

func (h *AuthHandler) OAuthProviders(c *gin.Context) {
	providers := []string{}
	if h.cfg.GoogleClientID != "" {
		providers = append(providers, "google")
	}
	if h.cfg.GitHubClientID != "" {
		providers = append(providers, "github")
	}
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required"})
		return
	}
	if err := h.auth.VerifyEmail(c.Request.Context(), token); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email verified"})
}

func (h *AuthHandler) MagicLinkRequest(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.auth.RequestMagicLink(c.Request.Context(), req.Email)
	c.JSON(http.StatusOK, gin.H{"message": "If that email exists, a login link has been sent"})
}

func (h *AuthHandler) MagicLinkVerify(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.WebURL+"/login?error=magic")
		return
	}
	resp, err := h.auth.VerifyMagicLink(c.Request.Context(), token, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.WebURL+"/login?error=magic")
		return
	}
	if resp.RequiresTotp {
		c.Redirect(http.StatusTemporaryRedirect, strings.TrimSuffix(h.cfg.WebURL, "/")+"/login?totp="+url.QueryEscape(resp.TempToken))
		return
	}
	redirect := strings.TrimSuffix(h.cfg.WebURL, "/") + "/auth/callback"
	u, _ := url.Parse(redirect)
	q := u.Query()
	q.Set("accessToken", resp.AccessToken)
	q.Set("refreshToken", resp.RefreshToken)
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusTemporaryRedirect, u.String())
}

func (h *AuthHandler) TotpLogin(c *gin.Context) {
	var req struct {
		TempToken string `json:"tempToken" binding:"required"`
		Code      string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.auth.CompleteTotpLogin(c.Request.Context(), req.TempToken, req.Code, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func GetUserID(c *gin.Context) string {
	v, _ := c.Get("userID")
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func GetOrgID(c *gin.Context) string {
	v, _ := c.Get("orgID")
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func GetRole(c *gin.Context) string {
	v, _ := c.Get("role")
	if s, ok := v.(string); ok {
		return s
	}
	return "viewer"
}
