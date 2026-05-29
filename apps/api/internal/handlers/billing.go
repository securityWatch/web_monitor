package handlers

import (
	"context"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/services"
)

type BillingHandler struct {
	db      *pgxpool.Pool
	billing *services.BillingService
	cfg     *config.Config
}

func NewBillingHandler(db *pgxpool.Pool, billing *services.BillingService, cfg *config.Config) *BillingHandler {
	return &BillingHandler{db: db, billing: billing, cfg: cfg}
}

func (h *BillingHandler) CreateCheckout(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2 AND role IN ('owner','admin'))
	`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if !h.billing.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "billing not configured", "code": "BILLING_NOT_CONFIGURED"})
		return
	}
	var email string
	_ = h.db.QueryRow(c.Request.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	base := h.cfg.WebURL
	success := base + "/settings?billing=success"
	cancel := base + "/settings?billing=cancel"
	url, err := h.billing.CreateCheckoutSession(c.Request.Context(), email, orgID, success, cancel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func (h *BillingHandler) Webhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "read body failed"})
		return
	}
	event, err := h.billing.VerifyWebhook(payload, c.GetHeader("Stripe-Signature"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.billing.HandleWebhookEvent(c.Request.Context(), event, func(ctx context.Context, orgID string) error {
		_, err := h.db.Exec(ctx, `
			UPDATE organizations SET plan_tier = 'pro', monitor_quota = 50, founding_member = true, updated_at = now()
			WHERE id = $1
		`, orgID)
		if err == nil {
			_, _ = h.db.Exec(ctx, `UPDATE founding_counter SET count = GREATEST(count - 1, 0) WHERE id = 1`)
		}
		return err
	})
	c.JSON(http.StatusOK, gin.H{"received": true})
}
