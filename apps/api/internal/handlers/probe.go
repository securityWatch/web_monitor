package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/pulsewatch/api/internal/services"
)

type ProbeHandler struct {
	dispatch *services.ProbeDispatch
	secret   string
}

func NewProbeHandler(dispatch *services.ProbeDispatch, secret string) *ProbeHandler {
	return &ProbeHandler{dispatch: dispatch, secret: secret}
}

func (h *ProbeHandler) auth(c *gin.Context) bool {
	if h.secret == "" {
		return false
	}
	return c.GetHeader("X-Probe-Secret") == h.secret
}

func (h *ProbeHandler) Claim(c *gin.Context) {
	if !h.auth(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	region := c.Query("region")
	if region == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "region required"})
		return
	}
	workerID := c.GetHeader("X-Worker-Id")
	if workerID == "" {
		workerID = "worker"
	}
	task, err := h.dispatch.ClaimTask(c.Request.Context(), region, workerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "claim failed"})
		return
	}
	c.JSON(http.StatusOK, task)
}

type completeBody struct {
	TaskID string                    `json:"taskId" binding:"required"`
	Result services.ProbeTaskResult  `json:"result" binding:"required"`
}

func (h *ProbeHandler) Complete(c *gin.Context) {
	if !h.auth(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var body completeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.dispatch.CompleteTask(c.Request.Context(), body.TaskID, body.Result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
