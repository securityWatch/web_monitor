package services

import (
	"context"
	"fmt"
	"log"
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
	return smtp.SendMail(addr, auth, e.cfg.SMTPFrom, []string{to}, []byte(msg))
}

func (e *EmailService) SendAlert(to, monitorName, status, detail string) error {
	subject := fmt.Sprintf("[PulseWatch] %s is %s", monitorName, strings.ToUpper(status))
	body := fmt.Sprintf(`<h2>Monitor Alert</h2>
<p><strong>%s</strong> is now <strong>%s</strong>.</p>
<p>%s</p>
<p><a href="https://pulsewatch.io/dashboard">View Dashboard</a></p>`, monitorName, status, detail)
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
