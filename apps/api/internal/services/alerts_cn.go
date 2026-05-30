package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type cnChannelConfig struct {
	URL         string `json:"url"`
	Secret      string `json:"secret"`
	SignEnabled bool   `json:"signEnabled"`
}

func parseCNChannelConfig(raw json.RawMessage) cnChannelConfig {
	var cfg cnChannelConfig
	_ = json.Unmarshal(raw, &cfg)
	return cfg
}

func cnAlertMarkdown(payload AlertPayload) string {
	status := payload.Status
	if payload.Event == "recovery" {
		status = "RECOVERED"
	}
	return fmt.Sprintf("### PulseWatch 告警\n\n**监控**: %s\n\n**状态**: %s\n\n**详情**: %s\n\n**时间**: %s",
		payload.Monitor, status, payload.Detail, payload.Timestamp)
}

func cnAlertText(payload AlertPayload) string {
	return fmt.Sprintf("[PulseWatch] %s is %s — %s (%s)", payload.Monitor, payload.Status, payload.Detail, payload.Timestamp)
}

// DingTalkSign computes the HMAC-SHA256 signature for DingTalk robot webhooks.
// stringToSign = timestamp + "\n" + secret; key = secret.
func DingTalkSign(timestamp int64, secret string) string {
	stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// FeishuSign computes the HMAC-SHA256 signature for Feishu/Lark bot webhooks.
// key = timestamp + "\n" + secret (Feishu uses the string itself as HMAC key).
func FeishuSign(timestamp int64, secret string) string {
	stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
	mac := hmac.New(sha256.New, []byte(stringToSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// BuildDingTalkWebhookURL appends timestamp and sign query params when signing is enabled.
func BuildDingTalkWebhookURL(baseURL, secret string, signEnabled bool) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", err
	}
	if !signEnabled || secret == "" {
		return u.String(), nil
	}
	ts := time.Now().UnixMilli()
	sign := DingTalkSign(ts, secret)
	q := u.Query()
	q.Set("timestamp", strconv.FormatInt(ts, 10))
	q.Set("sign", sign)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func (a *AlertService) deliverDingTalk(cfg cnChannelConfig, payload AlertPayload) error {
	webhookURL := strings.TrimSpace(cfg.URL)
	if webhookURL == "" {
		return fmt.Errorf("dingtalk webhook url required")
	}
	signedURL, err := BuildDingTalkWebhookURL(webhookURL, cfg.Secret, cfg.SignEnabled)
	if err != nil {
		return err
	}
	body := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"title": fmt.Sprintf("%s — %s", payload.Monitor, payload.Status),
			"text":  cnAlertMarkdown(payload),
		},
	}
	return a.postJSON(signedURL, body)
}

func (a *AlertService) deliverFeishu(cfg cnChannelConfig, payload AlertPayload) error {
	webhookURL := strings.TrimSpace(cfg.URL)
	if webhookURL == "" {
		return fmt.Errorf("feishu webhook url required")
	}
	body := map[string]interface{}{
		"msg_type": "text",
		"content": map[string]string{
			"text": cnAlertText(payload),
		},
	}
	if cfg.SignEnabled && cfg.Secret != "" {
		ts := time.Now().Unix()
		body["timestamp"] = strconv.FormatInt(ts, 10)
		body["sign"] = FeishuSign(ts, cfg.Secret)
	}
	return a.postJSON(webhookURL, body)
}

func (a *AlertService) deliverWeCom(cfg cnChannelConfig, payload AlertPayload) error {
	webhookURL := strings.TrimSpace(cfg.URL)
	if webhookURL == "" {
		return fmt.Errorf("wecom webhook url required")
	}
	body := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"content": cnAlertMarkdown(payload),
		},
	}
	return a.postJSON(webhookURL, body)
}
