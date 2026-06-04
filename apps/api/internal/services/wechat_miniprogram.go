package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

const (
	WeChatMiniProvider      = "wechat_mp"
	WeChatPlaceholderDomain = "users.wechat.pulsewatch"
	weChatCode2SessionURL   = "https://api.weixin.qq.com/sns/jscode2session"
	weChatTokenURL          = "https://api.weixin.qq.com/cgi-bin/token"
	weChatPhoneURL          = "https://api.weixin.qq.com/wxa/business/getuserphonenumber"
)

type WeChatMiniProgramService struct {
	cfg                *config.Config
	client             *http.Client
	accessToken        string
	accessTokenExpires time.Time
	mu                 sync.Mutex
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

// GetAccessToken returns a cached WeChat API access_token, refreshing if expired.
func (w *WeChatMiniProgramService) GetAccessToken(ctx context.Context) (string, error) {
	w.mu.Lock()
	if w.accessToken != "" && time.Now().Before(w.accessTokenExpires) {
		w.mu.Unlock()
		return w.accessToken, nil
	}
	w.mu.Unlock()

	q := url.Values{}
	q.Set("grant_type", "client_credential")
	q.Set("appid", w.cfg.WeChatMiniAppID)
	q.Set("secret", w.cfg.WeChatMiniAppSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, weChatTokenURL+"?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	res, err := w.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("wechat token api unreachable: %w", err)
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, 8192))
	if err != nil {
		return "", err
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("wechat token invalid response")
	}
	if result.ErrCode != 0 || result.AccessToken == "" {
		return "", fmt.Errorf("wechat getAccessToken: %s", result.ErrMsg)
	}

	w.mu.Lock()
	w.accessToken = result.AccessToken
	w.accessTokenExpires = time.Now().Add(time.Duration(result.ExpiresIn-60) * time.Second)
	w.mu.Unlock()

	return result.AccessToken, nil
}

type WeChatPhoneInfo struct {
	PhoneNumber     string `json:"phoneNumber"`
	PurePhoneNumber string `json:"purePhoneNumber"`
	CountryCode     string `json:"countryCode"`
}

// GetPhoneNumber retrieves the phone number using the code from bindgetphonenumber event.
func (w *WeChatMiniProgramService) GetPhoneNumber(ctx context.Context, code string) (*WeChatPhoneInfo, error) {
	if !w.Configured() {
		return nil, fmt.Errorf("wechat miniprogram not configured")
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("phone code required")
	}

	token, err := w.GetAccessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get access token: %w", err)
	}

	payload := map[string]string{"code": code}
	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		weChatPhoneURL+"?access_token="+url.QueryEscape(token),
		strings.NewReader(string(bodyBytes)),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := w.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wechat phone api unreachable: %w", err)
	}
	defer res.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(res.Body, 8192))
	if err != nil {
		return nil, err
	}

	var result struct {
		ErrCode   int              `json:"errcode"`
		ErrMsg    string           `json:"errmsg"`
		PhoneInfo *WeChatPhoneInfo `json:"phone_info"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("wechat phone api invalid response")
	}
	if result.ErrCode != 0 || result.PhoneInfo == nil {
		return nil, fmt.Errorf("wechat getPhoneNumber: %s", result.ErrMsg)
	}

	return result.PhoneInfo, nil
}

func WeChatMiniDisplayName(openID string) string {
	suffix := openID
	if len(suffix) > 6 {
		suffix = suffix[len(suffix)-6:]
	}
	return "微信用户" + suffix
}

func WeChatPhoneEmail(phone string) string {
	return fmt.Sprintf("phone_%s@%s", phone, WeChatPlaceholderDomain)
}
