package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSSLWarningTiers(t *testing.T) {
	assert.Equal(t, 30, sslTierForDays(29))
	assert.Equal(t, 14, sslTierForDays(14))
	assert.Equal(t, 7, sslTierForDays(7))
	assert.Equal(t, 1, sslTierForDays(1))
	assert.Equal(t, 0, sslTierForDays(60))

	tier, fire := shouldFireSSLWarning(29, 30, 999)
	assert.True(t, fire)
	assert.Equal(t, 30, tier)

	_, fire = shouldFireSSLWarning(29, 30, 30)
	assert.False(t, fire)

	tier, fire = shouldFireSSLWarning(13, 30, 30)
	assert.True(t, fire)
	assert.Equal(t, 14, tier)
}

func TestRecordsHashAndEqual(t *testing.T) {
	a := []string{"1.1.1.1", "8.8.8.8"}
	b := []string{"8.8.8.8", "1.1.1.1"}
	assert.True(t, recordsEqual(a, b))
	h1 := recordsHash(a)
	h2 := recordsHash(b)
	assert.Equal(t, h1, h2)
}

func TestTamperDiffPercent(t *testing.T) {
	assert.Equal(t, 0.0, tamperDiffPercent("abc", "abc", 100, 100))
	assert.Equal(t, 100.0, tamperDiffPercent("abc", "xyz", 100, 100))
}

func TestMatchBlocklist(t *testing.T) {
	cfg := map[string]interface{}{
		"policyCategories": map[string]interface{}{"gambling": true},
	}
	policy := parsePolicyCategories(cfg)
	matched := matchBlocklist("Welcome to our casino bonus page", cfg, policy)
	assert.NotEmpty(t, matched)
}

func TestNormalizeTamperBody(t *testing.T) {
	out := normalizeTamperBody("  hello   world  ")
	assert.Equal(t, "hello world", string(out))
}
