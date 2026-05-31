package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func GenerateToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	var hasLetter, hasDigit bool
	for _, r := range password {
		if unicode.IsLetter(r) {
			hasLetter = true
		}
		if unicode.IsDigit(r) {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return fmt.Errorf("password must contain letters and numbers")
	}
	return nil
}

func ValidateEmail(email string) bool {
	re := regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	return re.MatchString(email)
}

func Slugify(s string) string {
	s = strings.ToLower(s)
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "workspace"
	}
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}

func UniqueSlug(base string, suffix int) string {
	if suffix == 0 {
		return base
	}
	return fmt.Sprintf("%s-%d", base, suffix)
}

func PlanMinInterval(planTier string) int {
	switch planTier {
	case "pro", "team":
		return 60
	case "business":
		return 30
	default:
		return 300
	}
}

func PlanMinIntervalForMonitor(planTier, monitorType string, config []byte) int {
	if strings.ToLower(monitorType) == "tamper" && TamperAIRecognitionEnabled(config) {
		if planTier == "free" || strings.TrimSpace(planTier) == "" {
			return 1800
		}
		return 30
	}
	return PlanMinInterval(planTier)
}

func PlanMaxRegions(planTier string) int {
	switch planTier {
	case "pro":
		return 5
	case "team":
		return 10
	case "business":
		return 20
	default:
		return 2
	}
}

func PlanScreenshotRetentionDays(planTier string) int {
	switch planTier {
	case "pro":
		return 7
	case "team":
		return 30
	case "business":
		return 90
	default:
		return 0
	}
}

func PlanMonitorQuota(planTier string) int {
	switch planTier {
	case "pro":
		return 50
	case "team":
		return 150
	case "business":
		return 500
	default:
		return 10
	}
}

func TokenExpiry(hours int) time.Time {
	return time.Now().UTC().Add(time.Duration(hours) * time.Hour)
}

func RefreshExpiry(days int) time.Time {
	return time.Now().UTC().AddDate(0, 0, days)
}
