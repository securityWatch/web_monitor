package services

import "strings"

// NormalizeEmailLocale maps request/user locale to supported email language (en | zh).
func NormalizeEmailLocale(locale string) string {
	locale = strings.ToLower(strings.TrimSpace(locale))
	if locale == "" {
		return "en"
	}
	if strings.HasPrefix(locale, "zh") {
		return "zh"
	}
	return "en"
}

// ResolveEmailLocale picks the best locale for outbound auth email.
// Priority: explicit body locale → saved user locale → Accept-Language → en.
func ResolveEmailLocale(bodyLocale, userLocale, acceptLanguage string) string {
	if loc := strings.TrimSpace(bodyLocale); loc != "" {
		return NormalizeEmailLocale(loc)
	}
	if loc := strings.TrimSpace(userLocale); loc != "" {
		return NormalizeEmailLocale(loc)
	}
	al := strings.ToLower(strings.TrimSpace(acceptLanguage))
	if al == "" {
		return "en"
	}
	first := strings.Split(al, ",")[0]
	first = strings.TrimSpace(strings.Split(first, ";")[0])
	if strings.HasPrefix(first, "zh") {
		return "zh"
	}
	return "en"
}

type OTPEmailCopy struct {
	Subject string
	Intro   string
	Footer  string
}

func OTPEmailCopyFor(locale, purpose string) OTPEmailCopy {
	locale = NormalizeEmailLocale(locale)
	if purpose == OTPPurposePasswordReset {
		if locale == "zh" {
			return OTPEmailCopy{
				Subject: "PulseWatch 重置密码验证码",
				Intro:   "请使用以下验证码重置密码（5 分钟内有效）：",
				Footer:  "验证码 5 分钟内有效。如非本人操作，请忽略此邮件。",
			}
		}
		return OTPEmailCopy{
			Subject: "PulseWatch password reset code",
			Intro:   "Use this code to reset your password (valid for 5 minutes):",
			Footer:  "This code expires in 5 minutes. If you did not request this, you can ignore this email.",
		}
	}
	if locale == "zh" {
		return OTPEmailCopy{
			Subject: "注册 PulseWatch 验证码",
			Intro:   "请使用以下验证码完成注册（5 分钟内有效）：",
			Footer:  "验证码 5 分钟内有效。如非本人操作，请忽略此邮件。",
		}
	}
	return OTPEmailCopy{
		Subject: "PulseWatch registration code",
		Intro:   "Use this code to complete registration (valid for 5 minutes):",
		Footer:  "This code expires in 5 minutes. If you did not request this, you can ignore this email.",
	}
}
