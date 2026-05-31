package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

const (
	WeChatMiniProvider       = "wechat_mp"
	WeChatPlaceholderDomain  = "users.wechat.pulsewatch"
	weChatCode2SessionURL    = "https://api.weixin.qq.com/sns/jscode2session"
)

type WeChatMiniProgramService struct {
	cfg    *config.Config
	client *http.Client
}

func NewWeChatMiniProgramService(cfg *config.Config) *WeChatMiniProgramService {
	return &WeChatMiniProgramService{
		cfg: cfg,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (w *WeChatMiniProgramService) Configured() bool {
	return w.cfg.WeChatMiniAppID != "" && w.cfg.WeChatMiniAppSecret != ""
}

type weChatCode2SessionResp struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

type WeChatSession struct {
	OpenID  string
	UnionID string
}

func WeChatPlaceholderEmail(openID string) string {
	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			return r
		}
		return '_'
	}, openID)
	if safe == "" {
		safe = "user"
	}
	return fmt.Sprintf("wx_%s@%s", safe, WeChatPlaceholderDomain)
}

func IsWeChatPlaceholderEmail(email string) bool {
	return strings.HasSuffix(strings.ToLower(email), "@"+WeChatPlaceholderDomain)
}

func (w *WeChatMiniProgramService) Code2Session(ctx context.Context, jsCode string) (*WeChatSession, error) {
	if !w.Configured() {
		return nil, fmt.Errorf("wechat miniprogram not configured")
	}
	jsCode = strings.TrimSpace(jsCode)
	if jsCode == "" {
		return nil, fmt.Errorf("code required")
	}

	q := url.Values{}
	q.Set("appid", w.cfg.WeChatMiniAppID)
	q.Set("secret", w.cfg.WeChatMiniAppSecret)
	q.Set("js_code", jsCode)
	q.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, weChatCode2SessionURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	res, err := w.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wechat api unreachable: %w", err)
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, 4096))
	if err != nil {
		return nil, err
	}
	var parsed weChatCode2SessionResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("wechat api invalid response")
	}
	if parsed.ErrCode != 0 || parsed.OpenID == "" {
		msg := parsed.ErrMsg
		if msg == "" {
			msg = "invalid code"
		}
		return nil, fmt.Errorf("wechat code2session: %s", msg)
	}
	uid := parsed.OpenID
	if parsed.UnionID != "" {
		uid = parsed.UnionID
	}
	return &WeChatSession{OpenID: parsed.OpenID, UnionID: uid}, nil
}

func WeChatMiniDisplayName(openID string) string {
	suffix := openID
	if len(suffix) > 6 {
		suffix = suffix[len(suffix)-6:]
	}
	return "微信用户" + suffix
}
