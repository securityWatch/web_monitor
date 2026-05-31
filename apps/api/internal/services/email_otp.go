package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
)

const (
	OTPPurposeRegister       = "register"
	OTPPurposePasswordReset  = "password_reset"
	OTPValidity              = 5 * time.Minute
	OTPMaxSendsPerMinute     = 2
)

type OTPRateLimitError struct{}

func (OTPRateLimitError) Error() string {
	return "too many verification codes sent; try again in a minute"
}

type EmailOTPService struct {
	db    *pgxpool.Pool
	cfg   *config.Config
	email *EmailService
}

func NewEmailOTPService(db *pgxpool.Pool, cfg *config.Config, email *EmailService) *EmailOTPService {
	return &EmailOTPService{db: db, cfg: cfg, email: email}
}

func normalizeOTPEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func generateOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func (s *EmailOTPService) checkSendRate(ctx context.Context, email, purpose string) error {
	var count int
	err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM email_otp_codes
		WHERE email = $1 AND purpose = $2 AND created_at > now() - interval '1 minute'
	`, email, purpose).Scan(&count)
	if err != nil {
		return err
	}
	if count >= OTPMaxSendsPerMinute {
		return OTPRateLimitError{}
	}
	return nil
}

func (s *EmailOTPService) SendRegisterCode(ctx context.Context, email, locale string) error {
	email = normalizeOTPEmail(email)
	if !ValidateEmail(email) {
		return fmt.Errorf("invalid email")
	}
	if IsWeChatPlaceholderEmail(email) {
		return fmt.Errorf("invalid email")
	}
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	if exists {
		return fmt.Errorf("email already exists")
	}
	return s.sendCode(ctx, email, OTPPurposeRegister, locale)
}

func (s *EmailOTPService) SendPasswordResetCode(ctx context.Context, email, bodyLocale, acceptLanguage string) error {
	email = normalizeOTPEmail(email)
	if !ValidateEmail(email) {
		return nil
	}
	var userLocale string
	err := s.db.QueryRow(ctx, `SELECT COALESCE(locale, 'en') FROM users WHERE email = $1`, email).Scan(&userLocale)
	if err != nil {
		return nil
	}
	locale := ResolveEmailLocale(bodyLocale, userLocale, acceptLanguage)
	return s.sendCode(ctx, email, OTPPurposePasswordReset, locale)
}

func (s *EmailOTPService) sendCode(ctx context.Context, email, purpose, locale string) error {
	if err := s.checkSendRate(ctx, email, purpose); err != nil {
		return err
	}
	code, err := generateOTPCode()
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE email_otp_codes SET used_at = now()
		WHERE email = $1 AND purpose = $2 AND used_at IS NULL
	`, email, purpose)
	_, err = s.db.Exec(ctx, `
		INSERT INTO email_otp_codes (id, email, purpose, code_hash, expires_at)
		VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
	`, uuid.New().String(), email, purpose, HashToken(code))
	if err != nil {
		return err
	}
	return s.email.SendVerificationCode(email, locale, purpose, code)
}

var errInvalidOTP = fmt.Errorf("invalid or expired verification code")

func (s *EmailOTPService) normalizeOTPInput(email, code string) (string, string, error) {
	email = normalizeOTPEmail(email)
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return "", "", errInvalidOTP
	}
	return email, code, nil
}

// CheckCode validates an OTP without consuming it (wrong codes do not invalidate a valid OTP).
func (s *EmailOTPService) CheckCode(ctx context.Context, email, purpose, code string) error {
	email, code, err := s.normalizeOTPInput(email, code)
	if err != nil {
		return err
	}
	hash := HashToken(code)
	var id string
	err = s.db.QueryRow(ctx, `
		SELECT id FROM email_otp_codes
		WHERE email = $1 AND purpose = $2 AND code_hash = $3
		  AND used_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC LIMIT 1
	`, email, purpose, hash).Scan(&id)
	if err != nil {
		return errInvalidOTP
	}
	return nil
}

// ConsumeCodeInTx marks a previously checked OTP as used inside an open transaction.
func (s *EmailOTPService) ConsumeCodeInTx(ctx context.Context, tx pgx.Tx, email, purpose, code string) error {
	email, code, err := s.normalizeOTPInput(email, code)
	if err != nil {
		return err
	}
	hash := HashToken(code)
	var id string
	err = tx.QueryRow(ctx, `
		WITH candidate AS (
			SELECT id FROM email_otp_codes
			WHERE email = $1 AND purpose = $2 AND code_hash = $3
			  AND used_at IS NULL AND expires_at > now()
			ORDER BY created_at DESC LIMIT 1
			FOR UPDATE
		)
		UPDATE email_otp_codes SET used_at = now()
		FROM candidate WHERE email_otp_codes.id = candidate.id
		RETURNING email_otp_codes.id
	`, email, purpose, hash).Scan(&id)
	if err != nil {
		return errInvalidOTP
	}
	return nil
}
