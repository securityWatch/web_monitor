package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"

	"github.com/pulsewatch/api/internal/config"
)

type EmailService struct {
	cfg *config.Config
}

func NewEmailService(cfg *config.Config) *EmailService {
	return &EmailService{cfg: cfg}
}

func (e *EmailService) Send(ctx context.Context, to, subject, body string) error {
	if e.cfg.SMTPMode == "console" || e.cfg.SMTPHost == "" {
		log.Printf("[EMAIL] To: %s | Subject: %s\n%s", to, subject, body)
		return nil
	}

	msg := strings.Join([]string{
		fmt.Sprintf("From: %s", e.cfg.SMTPFrom),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	auth := smtp.PlainAuth("", e.cfg.SMTPUser, e.cfg.SMTPPass, e.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", e.cfg.SMTPHost, e.cfg.SMTPPort)
	if e.cfg.SMTPSecure || e.cfg.SMTPPort == 465 {
		return e.sendMailTLS(addr, auth, e.cfg.SMTPFrom, []string{to}, []byte(msg))
	}
	return smtp.SendMail(addr, auth, e.cfg.SMTPFrom, []string{to}, []byte(msg))
}

func (e *EmailService) sendMailTLS(addr string, auth smtp.Auth, from string, to []string, msg []byte) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func (e *EmailService) SendVerificationCode(to, locale, purpose, code string) error {
	copy := OTPEmailCopyFor(locale, purpose)
	body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px">
<h2 style="color:#3b82f6">PulseWatch</h2>
<p>%s</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#111">%s</p>
<p style="color:#52525b">%s</p>
</div>`, copy.Intro, code, copy.Footer)
	return e.Send(context.Background(), to, copy.Subject, body)
}

func (e *EmailService) SendAlert(to, monitorName, status, detail string) error {
	statusLower := strings.ToLower(status)
	var subject, heading, color string
	switch statusLower {
	case "up", "recovery":
		subject = fmt.Sprintf("[PulseWatch] ✅ %s recovered", monitorName)
		heading = "Monitor Recovered"
		color = "#10b981"
	case "ssl_warning":
		subject = fmt.Sprintf("[PulseWatch] ⚠️ SSL warning: %s", monitorName)
		heading = "SSL Certificate Warning"
		color = "#f59e0b"
	case "dns_change":
		subject = fmt.Sprintf("[PulseWatch] ⚠️ DNS change: %s", monitorName)
		heading = "DNS Record Change"
		color = "#f59e0b"
	case "tamper_major_change", "tamper_policy_violation", "tamper_ai_content_violation":
		subject = fmt.Sprintf("[PulseWatch] ⚠️ Content alert: %s", monitorName)
		heading = "Content Integrity Alert"
		color = "#f59e0b"
	case "test":
		subject = "[PulseWatch] Test alert"
		heading = "Test Alert"
		color = "#3b82f6"
	default:
		subject = fmt.Sprintf("[PulseWatch] 🔴 %s is DOWN", monitorName)
		heading = "Monitor Down"
		color = "#ef4444"
	}
	body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px">
<h2 style="color:%s">%s</h2>
<p><strong>%s</strong> — <strong>%s</strong></p>
<p style="color:#52525b">%s</p>
<p style="margin-top:24px"><a href="http://49.234.112.108/zh/dashboard" style="color:#3b82f6">View Dashboard →</a></p>
</div>`, color, heading, monitorName, strings.ToUpper(status), detail)
	return e.Send(context.Background(), to, subject, body)
}

func (e *EmailService) SendPasswordReset(to, resetURL string) error {
	subject := "Reset your PulseWatch password"
	body := fmt.Sprintf(`<h2>Password Reset</h2>
<p>Click the link below to reset your password (valid for 1 hour):</p>
<p><a href="%s">%s</a></p>
<p>If you didn't request this, ignore this email.</p>`, resetURL, resetURL)
	return e.Send(context.Background(), to, subject, body)
}

func (e *EmailService) SendEmailChangeConfirm(to, confirmURL string) error {
	subject := "Confirm your new email address"
	body := fmt.Sprintf(`<h2>Email Change</h2>
<p>Click to confirm your new email:</p>
<p><a href="%s">%s</a></p>`, confirmURL, confirmURL)
	return e.Send(context.Background(), to, subject, body)
}

func (e *EmailService) SendEmailVerification(to, verifyURL string) error {
	subject := "Verify your PulseWatch email"
	body := fmt.Sprintf(`<h2>Verify your email</h2>
<p>Click the link below to verify your email (valid for 24 hours):</p>
<p><a href="%s">%s</a></p>`, verifyURL, verifyURL)
	return e.Send(context.Background(), to, subject, body)
}

func (e *EmailService) SendMagicLink(to, loginURL string) error {
	subject := "Your PulseWatch login link"
	body := fmt.Sprintf(`<h2>Sign in to PulseWatch</h2>
<p>Click below to sign in (valid for 15 minutes):</p>
<p><a href="%s">%s</a></p>
<p>If you didn't request this, ignore this email.</p>`, loginURL, loginURL)
	return e.Send(context.Background(), to, subject, body)
}

func (e *EmailService) SendStatusSubscribeConfirm(to, confirmURL, pageName string) error {
	subject := fmt.Sprintf("Confirm subscription to %s status page", pageName)
	body := fmt.Sprintf(`<h2>Status page updates</h2>
<p>Confirm your subscription to <strong>%s</strong>:</p>
<p><a href="%s">%s</a></p>`, pageName, confirmURL, confirmURL)
	return e.Send(context.Background(), to, subject, body)
}
