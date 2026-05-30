package services

import (
	"crypto/tls"
	"fmt"
	"time"
)

// SSL warning tiers (days before expiry) per PRD §C.6.
var sslWarningTiers = []int{30, 14, 7, 1}

func sslWarnDaysFromConfig(cfg map[string]interface{}) int {
	if v, ok := cfg["warnDays"].(float64); ok && v > 0 {
		return int(v)
	}
	return 30
}

func sslTierForDays(daysLeft int) int {
	result := 0
	for _, t := range sslWarningTiers {
		if daysLeft <= t && (result == 0 || t < result) {
			result = t
		}
	}
	return result
}

func tlsVersionLabel(v uint16) string {
	switch v {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("0x%04x", v)
	}
}

func lastSSLWarningTier(cfg map[string]interface{}) int {
	if v, ok := cfg["lastSslWarningTier"].(float64); ok {
		return int(v)
	}
	return 999
}

func sslWarningDetail(daysLeft, tier int) string {
	if daysLeft <= 0 {
		return "SSL certificate has expired"
	}
	return fmt.Sprintf("SSL certificate expires in %d days (threshold: %d days)", daysLeft, tier)
}

func shouldFireSSLWarning(daysLeft, warnDays, lastTier int) (int, bool) {
	if daysLeft > warnDays {
		return 0, false
	}
	tier := sslTierForDays(daysLeft)
	if tier == 0 {
		return 0, false
	}
	// Fire when crossing into a lower (more urgent) tier than last notified.
	if tier >= lastTier {
		return 0, false
	}
	return tier, true
}

func enrichSSLMeta(meta map[string]interface{}, notAfter time.Time, issuer string, tlsVer uint16) {
	if meta == nil {
		return
	}
	daysLeft := int(time.Until(notAfter).Hours() / 24)
	meta["sslDaysLeft"] = daysLeft
	meta["sslExpiresAt"] = notAfter.Format(time.RFC3339)
	if issuer != "" {
		meta["issuer"] = issuer
	}
	if tlsVer != 0 {
		meta["tlsVersion"] = tlsVersionLabel(tlsVer)
	}
	if daysLeft <= 30 {
		meta["sslWarning"] = true
	}
}
