package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGenerateOTPCodeFormat(t *testing.T) {
	code, err := generateOTPCode()
	assert.NoError(t, err)
	assert.Len(t, code, 6)
	for _, r := range code {
		assert.True(t, r >= '0' && r <= '9')
	}
}

func TestNormalizeOTPEmail(t *testing.T) {
	assert.Equal(t, "a@b.com", normalizeOTPEmail("  A@B.com "))
}

func TestOTPRateLimitError(t *testing.T) {
	assert.Contains(t, OTPRateLimitError{}.Error(), "minute")
}
