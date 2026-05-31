package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/services"
)

type WeChatAuthHandler struct {
	auth   *services.AuthService
	wechat *services.WeChatMiniProgramService
}

func NewWeChatAuthHandler(auth *services.AuthService, wechat *services.WeChatMiniProgramService) *WeChatAuthHandler {
	return &WeChatAuthHandler{auth: auth, wechat: wechat}
}

type weChatMiniLoginReq struct {
	Code        string `json:"code" binding:"required"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl"`
}

func (h *WeChatAuthHandler) MiniprogramLogin(c *gin.Context) {
	if !h.wechat.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "WeChat mini program login is not configured",
			"code":  "WECHAT_NOT_CONFIGURED",
		})
		return
	}
	var req weChatMiniLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sess, err := h.wechat.Code2Session(c.Request.Context(), req.Code)
	if err != nil {
		code := "WECHAT_AUTH_FAILED"
		status := http.StatusUnauthorized
		if strings.Contains(err.Error(), "not configured") {
			code = "WECHAT_NOT_CONFIGURED"
			status = http.StatusServiceUnavailable
		} else if strings.Contains(err.Error(), "code2session") || strings.Contains(err.Error(), "invalid code") {
			code = "WECHAT_CODE_INVALID"
		}
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}
	resp, err := h.auth.LoginOrRegisterWeChatMiniProgram(
		c.Request.Context(),
		sess.UnionID,
		sess.OpenID,
		strings.TrimSpace(req.DisplayName),
		strings.TrimSpace(req.AvatarURL),
		c.GetHeader("User-Agent"),
		c.ClientIP(),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *WeChatAuthHandler) MiniprogramBind(c *gin.Context) {
	if !h.wechat.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "WeChat mini program login is not configured",
			"code":  "WECHAT_NOT_CONFIGURED",
		})
		return
	}
	var req weChatMiniLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sess, err := h.wechat.Code2Session(c.Request.Context(), req.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error(), "code": "WECHAT_CODE_INVALID"})
		return
	}
	userID := GetUserID(c)
	if err := h.auth.BindWeChatMiniProgram(c.Request.Context(), userID, sess.UnionID); err != nil {
		if strings.Contains(err.Error(), "already linked") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "WECHAT_ALREADY_LINKED"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "wechat linked"})
}

func (h *WeChatAuthHandler) MiniprogramStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.wechat.Configured()})
}
