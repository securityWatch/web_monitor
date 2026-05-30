package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	loginLockoutMaxFailures = 5
	loginLockoutDuration    = 15 * time.Minute
)

var ErrAccountLocked = errors.New("account temporarily locked")

// LoginLockoutService tracks failed password logins per email + IP.
type LoginLockoutService struct {
	db *pgxpool.Pool
}

func NewLoginLockoutService(db *pgxpool.Pool) *LoginLockoutService {
	return &LoginLockoutService{db: db}
}

// CheckLocked returns locked=true and retryAfter if the pair is still locked out.
func (s *LoginLockoutService) CheckLocked(ctx context.Context, email, ip string) (locked bool, retryAfter time.Duration, err error) {
	email = normalizeLockoutEmail(email)
	if email == "" || ip == "" {
		return false, 0, nil
	}
	var lockedUntil *time.Time
	err = s.db.QueryRow(ctx, `
		SELECT locked_until FROM login_lockouts
		WHERE email = $1 AND ip_address = NULLIF($2, '')::inet
	`, email, ip).Scan(&lockedUntil)
	if err != nil {
		return false, 0, nil
	}
	if lockedUntil == nil {
		return false, 0, nil
	}
	now := time.Now()
	if lockedUntil.After(now) {
		return true, lockedUntil.Sub(now), nil
	}
	_, _ = s.db.Exec(ctx, `
		UPDATE login_lockouts
		SET failed_count = 0, locked_until = NULL, updated_at = now()
		WHERE email = $1 AND ip_address = NULLIF($2, '')::inet
	`, email, ip)
	return false, 0, nil
}

// RecordFailure increments failures; returns locked if threshold reached.
func (s *LoginLockoutService) RecordFailure(ctx context.Context, email, ip string) (locked bool, retryAfter time.Duration, err error) {
	email = normalizeLockoutEmail(email)
	if email == "" || ip == "" {
		return false, 0, nil
	}
	now := time.Now()
	var failedCount int
	var lockedUntil *time.Time
	err = s.db.QueryRow(ctx, `
		SELECT failed_count, locked_until FROM login_lockouts
		WHERE email = $1 AND ip_address = NULLIF($2, '')::inet
	`, email, ip).Scan(&failedCount, &lockedUntil)
	if err != nil {
		failedCount = 0
	}
	if lockedUntil != nil && lockedUntil.After(now) {
		return true, lockedUntil.Sub(now), nil
	}
	if lockedUntil != nil && !lockedUntil.After(now) {
		failedCount = 0
		lockedUntil = nil
	}

	failedCount++
	var newLockedUntil *time.Time
	if failedCount >= loginLockoutMaxFailures {
		t := now.Add(loginLockoutDuration)
		newLockedUntil = &t
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO login_lockouts (email, ip_address, failed_count, locked_until, updated_at)
		VALUES ($1, NULLIF($2, '')::inet, $3, $4, now())
		ON CONFLICT (email, ip_address) DO UPDATE SET
			failed_count = EXCLUDED.failed_count,
			locked_until = EXCLUDED.locked_until,
			updated_at = now()
	`, email, ip, failedCount, newLockedUntil)
	if err != nil {
		return false, 0, err
	}
	if newLockedUntil != nil {
		return true, newLockedUntil.Sub(now), nil
	}
	return false, 0, nil
}

// Clear removes lockout state after a successful login.
func (s *LoginLockoutService) Clear(ctx context.Context, email, ip string) {
	email = normalizeLockoutEmail(email)
	if email == "" || ip == "" {
		return
	}
	_, _ = s.db.Exec(ctx, `
		DELETE FROM login_lockouts WHERE email = $1 AND ip_address = NULLIF($2, '')::inet
	`, email, ip)
}

func normalizeLockoutEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// AccountLockedError is returned when login is blocked after too many failures.
type AccountLockedError struct {
	RetryAfter time.Duration
}

func (e *AccountLockedError) Error() string {
	return ErrAccountLocked.Error()
}
