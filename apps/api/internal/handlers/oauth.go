package handlers

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/services"
)

type OAuthHandler struct {
	oauth  *services.OAuthService
	webURL string
}

func NewOAuthHandler(oauth *services.OAuthService, webURL string) *OAuthHandler {
	return &OAuthHandler{oauth: oauth, webURL: webURL}
}

func (h *OAuthHandler) Start(c *gin.Context) {
	provider := c.Param("provider")
	authURL, err := h.oauth.AuthURL(provider)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "OAUTH_NOT_CONFIGURED"})
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

func (h *OAuthHandler) Callback(c *gin.Context) {
	provider := c.Param("provider")
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.webURL+"/login?error=oauth")
		return
	}
	resp, redirect, err := h.oauth.HandleCallback(c.Request.Context(), provider, code, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.webURL+"/login?error=oauth")
		return
	}
	u, _ := url.Parse(redirect)
	q := u.Query()
	q.Set("accessToken", resp.AccessToken)
	q.Set("refreshToken", resp.RefreshToken)
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusTemporaryRedirect, u.String())
}
