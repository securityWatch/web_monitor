package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeEmailLocale(t *testing.T) {
	assert.Equal(t, "zh", NormalizeEmailLocale("zh-CN"))
	assert.Equal(t, "zh", NormalizeEmailLocale("zh"))
	assert.Equal(t, "en", NormalizeEmailLocale("en-US"))
	assert.Equal(t, "en", NormalizeEmailLocale(""))
}

func TestResolveEmailLocale(t *testing.T) {
	assert.Equal(t, "zh", ResolveEmailLocale("zh", "", ""))
	assert.Equal(t, "en", ResolveEmailLocale("", "en", ""))
	assert.Equal(t, "zh", ResolveEmailLocale("", "", "zh-CN,en;q=0.9"))
	assert.Equal(t, "en", ResolveEmailLocale("", "", "en-US,en;q=0.9"))
}

func TestOTPEmailCopyForEnglishRegister(t *testing.T) {
	copy := OTPEmailCopyFor("en", OTPPurposeRegister)
	assert.Contains(t, copy.Subject, "registration")
	assert.Contains(t, copy.Footer, "5 minutes")
}

func TestOTPEmailCopyForChineseReset(t *testing.T) {
	copy := OTPEmailCopyFor("zh", OTPPurposePasswordReset)
	assert.Contains(t, copy.Subject, "重置密码")
}
