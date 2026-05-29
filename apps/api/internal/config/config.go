package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL        string
	JWTSecret          string
	JWTRefreshSecret   string
	Port               string
	CorsOrigin         string
	CorsOrigins        []string
	SMTPMode           string
	SMTPHost           string
	SMTPPort           int
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	AccessTokenTTLMin   int
	RefreshTokenTTLDays int
}

func Load() *Config {
	smtpPort, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))
	accessTTL, _ := strconv.Atoi(getEnv("ACCESS_TOKEN_TTL_MIN", "15"))
	refreshTTL, _ := strconv.Atoi(getEnv("REFRESH_TOKEN_TTL_DAYS", "30"))

	return &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-jwt-secret-change-in-production"),
		JWTRefreshSecret:   getEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production"),
		Port:               getEnv("PORT", "4000"),
		CorsOrigin:         getEnv("CORS_ORIGIN", "http://localhost:3000"),
		CorsOrigins:        parseCorsOrigins(),
		SMTPMode:           getEnv("SMTP_MODE", "console"),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           smtpPort,
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", "noreply@pulsewatch.io"),
		AccessTokenTTLMin:   accessTTL,
		RefreshTokenTTLDays: refreshTTL,
	}
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
