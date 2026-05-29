package services

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"
)

type TOTPService struct {
	db *pgxpool.Pool
}

func NewTOTPService(db *pgxpool.Pool) *TOTPService {
	return &TOTPService{db: db}
}

func (t *TOTPService) Setup(ctx context.Context, userID, email string) (secret, uri string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "PulseWatch",
		AccountName: email,
	})
	if err != nil {
		return "", "", err
	}
	_, _ = t.db.Exec(ctx, `
		INSERT INTO user_totp (user_id, secret, enabled)
		VALUES ($1, $2, false)
		ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = false
	`, userID, key.Secret())
	return key.Secret(), key.URL(), nil
}

func (t *TOTPService) Enable(ctx context.Context, userID, code string) error {
	var secret string
	err := t.db.QueryRow(ctx, `SELECT secret FROM user_totp WHERE user_id = $1`, userID).Scan(&secret)
	if err != nil {
		return fmt.Errorf("totp not set up")
	}
	if !totp.Validate(code, secret) {
		return fmt.Errorf("invalid code")
	}
	_, _ = t.db.Exec(ctx, `UPDATE user_totp SET enabled = true WHERE user_id = $1`, userID)
	return nil
}

func (t *TOTPService) Disable(ctx context.Context, userID string) {
	_, _ = t.db.Exec(ctx, `DELETE FROM user_totp WHERE user_id = $1`, userID)
}

func (t *TOTPService) IsEnabled(ctx context.Context, userID string) bool {
	var enabled bool
	_ = t.db.QueryRow(ctx, `SELECT enabled FROM user_totp WHERE user_id = $1`, userID).Scan(&enabled)
	return enabled
}

func (t *TOTPService) Validate(ctx context.Context, userID, code string) bool {
	var secret string
	err := t.db.QueryRow(ctx, `SELECT secret FROM user_totp WHERE user_id = $1 AND enabled = true`, userID).Scan(&secret)
	if err != nil {
		return false
	}
	return totp.Validate(code, secret)
}
