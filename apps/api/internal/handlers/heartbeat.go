package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/services"
)

type HeartbeatHandler struct {
	hb *services.HeartbeatService
}

func NewHeartbeatHandler(hb *services.HeartbeatService) *HeartbeatHandler {
	return &HeartbeatHandler{hb: hb}
}

func (h *HeartbeatHandler) Ping(c *gin.Context) {
	token := c.Param("token")
	if err := h.hb.Ping(c.Request.Context(), token); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
