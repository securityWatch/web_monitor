package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

type BillingService struct {
	cfg  *config.Config
	http *http.Client
}

func NewBillingService(cfg *config.Config) *BillingService {
	return &BillingService{cfg: cfg, http: &http.Client{}}
}

func (b *BillingService) Configured() bool {
	return b.cfg.StripeSecretKey != ""
}

func (b *BillingService) priceIDForPlan(plan string) (string, error) {
	switch plan {
	case "pro":
		if b.cfg.StripeProPriceID != "" {
			return b.cfg.StripeProPriceID, nil
		}
	case "team":
		if b.cfg.StripeTeamPriceID != "" {
			return b.cfg.StripeTeamPriceID, nil
		}
	case "business":
		if b.cfg.StripeBusinessPriceID != "" {
			return b.cfg.StripeBusinessPriceID, nil
		}
	default:
		return "", fmt.Errorf("unsupported billing plan")
	}
	return "", fmt.Errorf("stripe price not configured for %s", plan)
}

func NormalizeBillingPlan(plan string) string {
	plan = strings.ToLower(strings.TrimSpace(plan))
	switch plan {
	case "team", "business":
		return plan
	default:
		return "pro"
	}
}

func (b *BillingService) CreateCheckoutSession(ctx context.Context, customerEmail, orgID, plan, successURL, cancelURL string) (string, error) {
	if !b.Configured() {
		return "", fmt.Errorf("stripe not configured")
	}
	plan = NormalizeBillingPlan(plan)
	priceID, err := b.priceIDForPlan(plan)
	if err != nil {
		return "", err
	}

	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("success_url", successURL)
	form.Set("cancel_url", cancelURL)
	form.Set("customer_email", customerEmail)
	form.Set("client_reference_id", orgID)
	form.Set("line_items[0][price]", priceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("metadata[org_id]", orgID)
	form.Set("metadata[plan_tier]", plan)
	form.Set("metadata[founding_member]", "true")
	form.Set("subscription_data[metadata][org_id]", orgID)
	form.Set("subscription_data[metadata][plan_tier]", plan)
	form.Set("subscription_data[metadata][founding_member]", "true")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(b.cfg.StripeSecretKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := b.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("stripe error: %s", string(body))
	}
	var data struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return "", err
	}
	if data.URL == "" {
		return "", fmt.Errorf("no checkout url returned")
	}
	return data.URL, nil
}

func (b *BillingService) VerifyWebhook(payload []byte, sigHeader string) (map[string]interface{}, error) {
	if b.cfg.StripeWebhookSecret == "" {
		return nil, fmt.Errorf("webhook secret not configured")
	}
	if err := verifyStripeSignature(payload, sigHeader, b.cfg.StripeWebhookSecret); err != nil {
		return nil, err
	}
	var event map[string]interface{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, err
	}
	return event, nil
}

func verifyStripeSignature(payload []byte, sigHeader, secret string) error {
	parts := strings.Split(sigHeader, ",")
	var timestamp, signature string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if strings.HasPrefix(p, "t=") {
			timestamp = strings.TrimPrefix(p, "t=")
		}
		if strings.HasPrefix(p, "v1=") {
			signature = strings.TrimPrefix(p, "v1=")
		}
	}
	if timestamp == "" || signature == "" {
		return fmt.Errorf("missing Stripe signature")
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid Stripe signature timestamp")
	}
	if time.Since(time.Unix(ts, 0)) > 5*time.Minute || time.Until(time.Unix(ts, 0)) > 5*time.Minute {
		return fmt.Errorf("stale Stripe signature")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return fmt.Errorf("invalid Stripe signature")
	}
	return nil
}

func stripeEventObject(event map[string]interface{}) map[string]interface{} {
	if data, ok := event["data"].(map[string]interface{}); ok {
		if obj, ok := data["object"].(map[string]interface{}); ok {
			return obj
		}
	}
	return nil
}

func stripeEventMetadata(event map[string]interface{}) map[string]interface{} {
	if obj := stripeEventObject(event); obj != nil {
		if meta, ok := obj["metadata"].(map[string]interface{}); ok {
			return meta
		}
	}
	return nil
}

func stripeEventOrgID(event map[string]interface{}) string {
	obj := stripeEventObject(event)
	if obj == nil {
		return ""
	}
	if meta := stripeEventMetadata(event); meta != nil {
		if org, ok := meta["org_id"].(string); ok {
			return org
		}
	}
	if ref, ok := obj["client_reference_id"].(string); ok {
		return ref
	}
	return ""
}

func stripeEventPlan(event map[string]interface{}) string {
	if meta := stripeEventMetadata(event); meta != nil {
		if plan, ok := meta["plan_tier"].(string); ok {
			return NormalizeBillingPlan(plan)
		}
	}
	return "pro"
}

func stripeEventFounding(event map[string]interface{}) bool {
	if meta := stripeEventMetadata(event); meta != nil {
		if v, ok := meta["founding_member"].(string); ok {
			return v == "true" || v == "1"
		}
	}
	return true
}

func (b *BillingService) HandleWebhookEvent(ctx context.Context, event map[string]interface{}, applyFn func(ctx context.Context, orgID, plan string, active, founding bool) error) error {
	typ, _ := event["type"].(string)
	orgID := stripeEventOrgID(event)
	if orgID == "" {
		return nil
	}
	switch typ {
	case "checkout.session.completed", "invoice.paid", "customer.subscription.created":
		return applyFn(ctx, orgID, stripeEventPlan(event), true, stripeEventFounding(event))
	case "customer.subscription.deleted":
		return applyFn(ctx, orgID, "free", false, false)
	}
	return nil
}

func (b *BillingService) PostForm(ctx context.Context, endpoint string, form url.Values) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader([]byte(form.Encode())))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(b.cfg.StripeSecretKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := b.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	return io.ReadAll(res.Body)
}
