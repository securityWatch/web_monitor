package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

type Notifier struct {
	cfg    *config.Config
	client *http.Client
}

func NewNotifier(cfg *config.Config) *Notifier {
	return &Notifier{
		cfg: cfg,
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

func (n *Notifier) Configured() bool {
	return n != nil && n.cfg.DingTalkWebhookURL != ""
}

func (n *Notifier) UserRegistered(email, displayName, userID, provider string) {
	if !n.Configured() {
		return
	}
	n.sendAsync(formatUserRegisteredMessage(email, displayName, userID, provider))
}

func (n *Notifier) MonitorCreated(name, monitorType, targetURL, ownerEmail, ownerName, monitorID string) {
	if !n.Configured() {
		return
	}
	n.sendAsync(formatMonitorCreatedMessage(name, monitorType, targetURL, ownerEmail, ownerName, monitorID))
}

func formatUserRegisteredMessage(email, displayName, userID, provider string) string {
	emailLine := email
	if emailLine == "" {
		emailLine = "（无邮箱）"
	}
	if provider == "" {
		provider = "email"
	}
	return fmt.Sprintf(
		"monitor\n【新用户注册】\n昵称：%s\n邮箱：%s\n登录方式：%s\n用户 ID：%s\n时间：%s",
		displayName, emailLine, provider, userID, time.Now().In(chinaLoc()).Format("2006-01-02 15:04:05"),
	)
}

func formatMonitorCreatedMessage(name, monitorType, targetURL, ownerEmail, ownerName, monitorID string) string {
	owner := ownerEmail
	if owner == "" {
		owner = ownerName
	}
	if owner == "" {
		owner = "—"
	}
	return fmt.Sprintf(
		"monitor\n【新建监控】\n名称：%s\n类型：%s\n目标：%s\n所有者：%s\n监控 ID：%s\n时间：%s",
		name, monitorType, targetURL, owner, monitorID,
		time.Now().In(chinaLoc()).Format("2006-01-02 15:04:05"),
	)
}

func (n *Notifier) sendAsync(text string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if err := n.sendText(ctx, text); err != nil {
			log.Printf("[notifier] dingtalk send failed: %v", err)
		}
	}()
}

func (n *Notifier) sendText(ctx context.Context, text string) error {
	body, err := json.Marshal(map[string]any{
		"msgtype": "text",
		"text":    map[string]string{"content": text},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.cfg.DingTalkWebhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	respBody, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		return fmt.Errorf("dingtalk http %d: %s", res.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(respBody, &result); err == nil && result.ErrCode != 0 {
		return fmt.Errorf("dingtalk errcode %d: %s", result.ErrCode, result.ErrMsg)
	}
	return nil
}

func chinaLoc() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*3600)
	}
	return loc
}
