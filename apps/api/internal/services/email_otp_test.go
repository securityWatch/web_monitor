package services

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func testOTPDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		dbURL = "postgresql://pulsewatch:pulsewatch@localhost:6541/pulsewatch"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Skipf("database unavailable: %v", err)
	}
	return pool
}

func seedTestOTP(t *testing.T, pool *pgxpool.Pool, email, purpose, code string) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO email_otp_codes (id, email, purpose, code_hash, expires_at)
		VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
	`, uuid.New().String(), normalizeOTPEmail(email), purpose, HashToken(code))
	require.NoError(t, err)
}

func otpUnusedCount(t *testing.T, pool *pgxpool.Pool, email, purpose, code string) int {
	t.Helper()
	ctx := context.Background()
	var count int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM email_otp_codes
		WHERE email = $1 AND purpose = $2 AND code_hash = $3 AND used_at IS NULL
	`, normalizeOTPEmail(email), purpose, HashToken(code)).Scan(&count)
	require.NoError(t, err)
	return count
}

func TestEmailOTPWrongCodeDoesNotConsume(t *testing.T) {
	pool := testOTPDB(t)
	otp := NewEmailOTPService(pool, config.Load(), nil)
	ctx := context.Background()
	email := "otp-wrong-" + uuid.New().String() + "@test.pulsewatch.io"
	code := "654321"
	seedTestOTP(t, pool, email, OTPPurposeRegister, code)

	err := otp.CheckCode(ctx, email, OTPPurposeRegister, "000000")
	assert.Error(t, err)
	assert.Equal(t, 1, otpUnusedCount(t, pool, email, OTPPurposeRegister, code))

	err = otp.CheckCode(ctx, email, OTPPurposeRegister, code)
	assert.NoError(t, err)
	assert.Equal(t, 1, otpUnusedCount(t, pool, email, OTPPurposeRegister, code))
}

func TestEmailOTPConsumeInTxMarksUsed(t *testing.T) {
	pool := testOTPDB(t)
	otp := NewEmailOTPService(pool, config.Load(), nil)
	ctx := context.Background()
	email := "otp-consume-" + uuid.New().String() + "@test.pulsewatch.io"
	code := "112233"
	seedTestOTP(t, pool, email, OTPPurposeRegister, code)
	require.NoError(t, otp.CheckCode(ctx, email, OTPPurposeRegister, code))

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	require.NoError(t, otp.ConsumeCodeInTx(ctx, tx, email, OTPPurposeRegister, code))
	require.NoError(t, tx.Commit(ctx))

	assert.Equal(t, 0, otpUnusedCount(t, pool, email, OTPPurposeRegister, code))
}

func TestRegisterWeakPasswordDoesNotConsumeOTP(t *testing.T) {
	pool := testOTPDB(t)
	cfg := config.Load()
	cfg.JWTSecret = "test-secret"
	auth := NewAuthService(pool, cfg, nil, NewEmailOTPService(pool, cfg, nil))
	ctx := context.Background()
	email := "otp-reg-" + uuid.New().String() + "@test.pulsewatch.io"
	code := "445566"
	seedTestOTP(t, pool, email, OTPPurposeRegister, code)

	_, err := auth.Register(ctx, email, "short", "Test", code, "email", "en")
	assert.Error(t, err)
	assert.Equal(t, 1, otpUnusedCount(t, pool, email, OTPPurposeRegister, code))

	resp, err := auth.Register(ctx, email, "password123", "Test", code, "email", "en")
	assert.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, 0, otpUnusedCount(t, pool, email, OTPPurposeRegister, code))
}
