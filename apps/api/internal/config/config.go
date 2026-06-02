package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL             string
	JWTSecret               string
	JWTRefreshSecret        string
	Port                    string
	CorsOrigin              string
	CorsOrigins             []string
	SMTPMode                string
	SMTPHost                string
	SMTPPort                int
	SMTPUser                string
	SMTPPass                string
	SMTPFrom                string
	SMTPSecure              bool
	AccessTokenTTLMin       int
	RefreshTokenTTLDays     int
	WebURL                  string
	GoogleClientID          string
	GoogleClientSecret      string
	GitHubClientID          string
	GitHubClientSecret      string
	WeChatMiniAppID         string
	WeChatMiniAppSecret     string
	WeChatMiniToken         string
	WeChatMiniAESKey        string
	OAuthRedirectURL        string
	StripeSecretKey         string
	StripeProPriceID        string
	StripeTeamPriceID       string
	StripeBusinessPriceID   string
	StripeWebhookSecret     string
	TwilioAccountSID        string
	TwilioAuthToken         string
	TwilioFromNumber        string
	ProbeSecret             string
	ProbeDispatch           bool
	S3Endpoint              string
	S3Bucket                string
	S3AccessKey             string
	S3SecretKey             string
	CheckRawRetentionDays   int
	CheckTotalRetentionDays int
	DingTalkWebhookURL      string
}

func Load() *Config {
	smtpPort, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))
	accessTTL, _ := strconv.Atoi(getEnv("ACCESS_TOKEN_TTL_MIN", "15"))
	refreshTTL, _ := strconv.Atoi(getEnv("REFRESH_TOKEN_TTL_DAYS", "30"))

	return &Config{
		DatabaseURL:             getEnv("DATABASE_URL", "postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch"),
		JWTSecret:               getEnv("JWT_SECRET", "dev-jwt-secret-change-in-production"),
		JWTRefreshSecret:        getEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production"),
		Port:                    getEnv("PORT", "4000"),
		CorsOrigin:              getEnv("CORS_ORIGIN", "http://localhost:3000"),
		CorsOrigins:             parseCorsOrigins(),
		SMTPMode:                getEnv("SMTP_MODE", "console"),
		SMTPHost:                getEnv("SMTP_HOST", ""),
		SMTPPort:                smtpPort,
		SMTPUser:                getEnv("SMTP_USER", ""),
		SMTPPass:                getEnv("SMTP_PASS", ""),
		SMTPFrom:                getEnv("SMTP_FROM", "noreply@pulsewatch.io"),
		SMTPSecure:              getEnv("SMTP_SECURE", "") == "true" || smtpPort == 465,
		AccessTokenTTLMin:       accessTTL,
		RefreshTokenTTLDays:     refreshTTL,
		WebURL:                  getEnv("WEB_URL", "http://localhost:3000"),
		GoogleClientID:          getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:      getEnv("GOOGLE_CLIENT_SECRET", ""),
		GitHubClientID:          getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret:      getEnv("GITHUB_CLIENT_SECRET", ""),
		WeChatMiniAppID:         getEnv("WECHAT_MINI_APP_ID", ""),
		WeChatMiniAppSecret:     getEnv("WECHAT_MINI_APP_SECRET", ""),
		WeChatMiniToken:         getEnv("WECHAT_MINI_TOKEN", ""),
		WeChatMiniAESKey:        getEnv("WECHAT_MINI_AES_KEY", ""),
		OAuthRedirectURL:        getEnv("OAUTH_REDIRECT_URL", ""),
		StripeSecretKey:         getEnv("STRIPE_SECRET_KEY", ""),
		StripeProPriceID:        getEnv("STRIPE_PRO_PRICE_ID", ""),
		StripeTeamPriceID:       getEnv("STRIPE_TEAM_PRICE_ID", ""),
		StripeBusinessPriceID:   getEnv("STRIPE_BUSINESS_PRICE_ID", ""),
		StripeWebhookSecret:     getEnv("STRIPE_WEBHOOK_SECRET", ""),
		TwilioAccountSID:        getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:         getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioFromNumber:        getEnv("TWILIO_FROM_NUMBER", ""),
		ProbeSecret:             getEnv("PROBE_SECRET", ""),
		ProbeDispatch:           getEnv("PROBE_DISPATCH", "false") == "true",
		S3Endpoint:              getEnv("S3_ENDPOINT", ""),
		S3Bucket:                getEnv("S3_BUCKET", ""),
		S3AccessKey:             getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:             getEnv("S3_SECRET_KEY", ""),
		CheckRawRetentionDays:   envInt("CHECK_RAW_RETENTION_DAYS", 7),
		CheckTotalRetentionDays: envInt("CHECK_TOTAL_RETENTION_DAYS", 90),
		DingTalkWebhookURL:      getEnv("DINGTALK_WEBHOOK_URL", ""),
	}
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseCorsOrigins() []string {
	seen := map[string]bool{}
	var out []string
	add := func(origin string) {
		origin = strings.TrimSpace(origin)
		if origin == "" || seen[origin] {
			return
		}
		seen[origin] = true
		out = append(out, origin)
	}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		for _, part := range strings.Split(v, ",") {
			add(part)
		}
	}
	if v := os.Getenv("CORS_ORIGIN"); v != "" {
		add(v)
	}
	add("http://localhost:3000")
	add("http://localhost:4000")
	return out
}
