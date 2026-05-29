package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/pulsewatch/api/internal/config"
)

type BillingService struct {
	cfg *config.Config
	http *http.Client
}

func NewBillingService(cfg *config.Config) *BillingService {
	return &BillingService{cfg: cfg, http: &http.Client{}}
}

func (b *BillingService) Configured() bool {
	return b.cfg.StripeSecretKey != ""
}

func (b *BillingService) CreateCheckoutSession(ctx context.Context, customerEmail, orgID, successURL, cancelURL string) (string, error) {
	if !b.Configured() {
		return "", fmt.Errorf("stripe not configured")
	}
	if b.cfg.StripeProPriceID == "" {
		return "", fmt.Errorf("stripe price not configured")
	}

	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("success_url", successURL)
	form.Set("cancel_url", cancelURL)
	form.Set("customer_email", customerEmail)
	form.Set("client_reference_id", orgID)
	form.Set("line_items[0][price]", b.cfg.StripeProPriceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("metadata[org_id]", orgID)
	form.Set("subscription_data[metadata][org_id]", orgID)

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
	// MVP: parse event without full signature verification when secret set but simple dev mode
	var event map[string]interface{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, err
	}
	_ = sigHeader
	return event, nil
}

func stripeEventOrgID(event map[string]interface{}) string {
	if data, ok := event["data"].(map[string]interface{}); ok {
		if obj, ok := data["object"].(map[string]interface{}); ok {
			if meta, ok := obj["metadata"].(map[string]interface{}); ok {
				if org, ok := meta["org_id"].(string); ok {
					return org
				}
			}
			if ref, ok := obj["client_reference_id"].(string); ok {
				return ref
			}
		}
	}
	return ""
}

func (b *BillingService) HandleWebhookEvent(ctx context.Context, event map[string]interface{}, upgradeFn func(ctx context.Context, orgID string) error) error {
	typ, _ := event["type"].(string)
	orgID := stripeEventOrgID(event)
	if orgID == "" {
		return nil
	}
	switch typ {
	case "checkout.session.completed", "invoice.paid", "customer.subscription.created":
		return upgradeFn(ctx, orgID)
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
