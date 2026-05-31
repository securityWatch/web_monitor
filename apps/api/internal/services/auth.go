package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/middleware"
	"github.com/pulsewatch/api/internal/models"
)

type AuthService struct {
	db       *pgxpool.Pool
	cfg      *config.Config
	lockout  *LoginLockoutService
	notifier *Notifier
	otp      *EmailOTPService
}

func NewAuthService(db *pgxpool.Pool, cfg *config.Config, notifier *Notifier, otp *EmailOTPService) *AuthService {
	return &AuthService{db: db, cfg: cfg, lockout: NewLoginLockoutService(db), notifier: notifier, otp: otp}
}

func (a *AuthService) Register(ctx context.Context, email, password, displayName, code, provider, locale string) (*models.AuthResponse, error) {
	if a.otp == nil {
		return nil, fmt.Errorf("email verification unavailable")
	}
	if err := a.otp.Verify(ctx, email, OTPPurposeRegister, code); err != nil {
		return nil, err
	}
	return a.registerInternal(ctx, email, password, displayName, true, provider, locale)
}

func (a *AuthService) registerInternal(ctx context.Context, email, password, displayName string, emailVerified bool, provider, locale string) (*models.AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !ValidateEmail(email) && !IsWeChatPlaceholderEmail(email) {
		return nil, fmt.Errorf("invalid email")
	}
	if !IsWeChatPlaceholderEmail(email) {
		if err := ValidatePassword(password); err != nil {
			return nil, err
		}
	}

	var exists bool
	err := a.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, fmt.Errorf("email already exists")
	}

	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}

	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}
	userLocale := NormalizeEmailLocale(locale)
	if provider == WeChatMiniProvider {
		userLocale = "zh"
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	userID := uuid.New().String()
	now := time.Now().UTC()
	var verifiedAt *time.Time
	if emailVerified {
		verifiedAt = &now
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, display_name, locale, email_verified_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
	`, userID, email, hash, displayName, userLocale, verifiedAt, now)
	if err != nil {
		return nil, err
	}

	orgID := uuid.New().String()
	slug := Slugify(displayName + "-workspace")
	suffix := 0
	for {
		var slugExists bool
		_ = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1)`, slug).Scan(&slugExists)
		if !slugExists {
			break
		}
		suffix++
		slug = UniqueSlug(Slugify(displayName+"-workspace"), suffix)
	}

	orgName := displayName + "'s Workspace"
	_, err = tx.Exec(ctx, `
		INSERT INTO organizations (id, name, slug, plan_tier, monitor_quota, seat_quota, created_at, updated_at)
		VALUES ($1, $2, $3, 'free', 15, 1, $4, $4)
	`, orgID, orgName, slug, now)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO organization_members (id, user_id, org_id, role, joined_at)
		VALUES ($1, $2, $3, 'owner', $4)
	`, uuid.New().String(), userID, orgID, now)
	if err != nil {
		return nil, err
	}

	if !IsWeChatPlaceholderEmail(email) {
		channelID := uuid.New().String()
		channelCfg := fmt.Sprintf(`{"email":"%s"}`, email)
		_, err = tx.Exec(ctx, `
			INSERT INTO alert_channels (id, org_id, name, type, config, enabled)
			VALUES ($1, $2, 'Default Email', 'email', $3::jsonb, true)
		`, channelID, orgID, channelCfg)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}

	if a.notifier != nil {
		a.notifier.UserRegistered(email, displayName, userID, provider)
	}
	return a.issueTokens(ctx, user, org, "", "")
}

func (a *AuthService) ResetPasswordWithCode(ctx context.Context, email, code, newPassword string) error {
	if a.otp == nil {
		return fmt.Errorf("email verification unavailable")
	}
	if err := ValidatePassword(newPassword); err != nil {
		return err
	}
	if err := a.otp.Verify(ctx, email, OTPPurposePasswordReset, code); err != nil {
		return err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	var userID string
	err := a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		return fmt.Errorf("invalid or expired verification code")
	}
	passHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	_, _ = a.db.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, passHash, userID)
	_, _ = a.db.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return nil
}

// LoginOrRegisterWeChatMiniProgram signs in or auto-registers via WeChat mini program wx.login code.
func (a *AuthService) LoginOrRegisterWeChatMiniProgram(ctx context.Context, providerUID, openID, displayName, avatarURL, userAgent, ip string) (*models.AuthResponse, error) {
	if displayName == "" {
		displayName = WeChatMiniDisplayName(openID)
	}
	email := WeChatPlaceholderEmail(openID)
	return a.LoginOrRegisterOAuth(ctx, WeChatMiniProvider, providerUID, email, displayName, avatarURL, userAgent, ip)
}

// BindWeChatMiniProgram links wx.login openid to an existing logged-in user.
func (a *AuthService) BindWeChatMiniProgram(ctx context.Context, userID, providerUID string) error {
	var existingUser string
	err := a.db.QueryRow(ctx, `
		SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2
	`, WeChatMiniProvider, providerUID).Scan(&existingUser)
	if err == nil && existingUser != userID {
		return fmt.Errorf("wechat account already linked to another user")
	}
	if err == nil && existingUser == userID {
		return nil
	}
	_, err = a.db.Exec(ctx, `
		INSERT INTO oauth_identities (id, user_id, provider, provider_user_id)
		VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
	`, uuid.New().String(), userID, WeChatMiniProvider, providerUID)
	return err
}

func (a *AuthService) Login(ctx context.Context, email, password, userAgent, ip string) (*models.AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if locked, retry, _ := a.lockout.CheckLocked(ctx, email, ip); locked {
		return nil, &AccountLockedError{RetryAfter: retry}
	}

	var userID, passHash string
	err := a.db.QueryRow(ctx, `
		SELECT id, COALESCE(password_hash, '') FROM users WHERE email = $1
	`, email).Scan(&userID, &passHash)
	invalid := func() error {
		if locked, retry, _ := a.lockout.RecordFailure(ctx, email, ip); locked {
			return &AccountLockedError{RetryAfter: retry}
		}
		return fmt.Errorf("invalid credentials")
	}
	if err != nil {
		return nil, invalid()
	}
	if passHash == "" || !CheckPassword(passHash, password) {
		return nil, invalid()
	}
	a.lockout.Clear(ctx, email, ip)

	var orgID string
	err = a.db.QueryRow(ctx, `
		SELECT org_id FROM organization_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1
	`, userID).Scan(&orgID)
	if err != nil {
		return nil, fmt.Errorf("no organization found")
	}

	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}

	totpSvc := NewTOTPService(a.db)
	if totpSvc.IsEnabled(ctx, userID) {
		temp, err := a.signTempTotpToken(userID)
		if err != nil {
			return nil, err
		}
		return &models.AuthResponse{RequiresTotp: true, TempToken: temp}, nil
	}

	return a.issueTokens(ctx, user, org, userAgent, ip)
}

func (a *AuthService) LoginOrRegisterOAuth(ctx context.Context, provider, providerUID, email, displayName, avatarURL, userAgent, ip string) (*models.AuthResponse, error) {
	var userID string
	err := a.db.QueryRow(ctx, `
		SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2
	`, provider, providerUID).Scan(&userID)
	if err != nil {
		_ = a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
		if userID == "" {
			resp, err := a.registerInternal(ctx, email, GenerateRandomPassword(), displayName, true, provider, "en")
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				return nil, err
			}
			if resp != nil {
				userID = resp.User.ID
			} else {
				_ = a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
			}
		}
		_, _ = a.db.Exec(ctx, `
			INSERT INTO oauth_identities (id, user_id, provider, provider_user_id)
			VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
		`, uuid.New().String(), userID, provider, providerUID)
	}
	if avatarURL != "" {
		_, _ = a.db.Exec(ctx, `UPDATE users SET avatar_url = $1, display_name = COALESCE(NULLIF(display_name,''), $2), email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $3`, avatarURL, displayName, userID)
	}

	var orgID string
	err = a.db.QueryRow(ctx, `SELECT org_id FROM organization_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1`, userID).Scan(&orgID)
	if err != nil {
		return nil, fmt.Errorf("no organization found")
	}
	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	return a.issueTokens(ctx, user, org, userAgent, ip)
}

// LoginOrRegisterSSO logs in via org OIDC; user must already belong to the org (or match email invite flow via Register).
func (a *AuthService) LoginOrRegisterSSO(ctx context.Context, orgID, provider, providerUID, email, displayName, userAgent, ip string) (*models.AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var userID string
	err := a.db.QueryRow(ctx, `
		SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2
	`, provider, providerUID).Scan(&userID)
	if err != nil {
		_ = a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
		if userID == "" {
			return nil, fmt.Errorf("no account for this email; ask your admin for an invitation")
		}
		_, _ = a.db.Exec(ctx, `
			INSERT INTO oauth_identities (id, user_id, provider, provider_user_id)
			VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
		`, uuid.New().String(), userID, provider, providerUID)
	}
	var member bool
	_ = a.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&member)
	if !member {
		return nil, fmt.Errorf("user is not a member of this organization")
	}
	if displayName != "" {
		_, _ = a.db.Exec(ctx, `UPDATE users SET display_name = COALESCE(NULLIF(display_name,''), $1), email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $2`, displayName, userID)
	}
	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	totpSvc := NewTOTPService(a.db)
	if totpSvc.IsEnabled(ctx, userID) {
		temp, err := a.signTempTotpToken(userID)
		if err != nil {
			return nil, err
		}
		return &models.AuthResponse{RequiresTotp: true, TempToken: temp}, nil
	}
	return a.issueTokens(ctx, user, org, userAgent, ip)
}

func GenerateRandomPassword() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (a *AuthService) RequestPasswordReset(ctx context.Context, email, webURL string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	var userID string
	err := a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		return nil
	}
	token, err := GenerateToken(32)
	if err != nil {
		return err
	}
	_, _ = a.db.Exec(ctx, `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`, userID)
	_, err = a.db.Exec(ctx, `
		INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, now() + interval '1 hour')
	`, uuid.New().String(), userID, HashToken(token))
	if err != nil {
		return err
	}
	resetURL := strings.TrimSuffix(webURL, "/") + "/reset-password?token=" + token
	emailSvc := NewEmailService(a.cfg)
	return emailSvc.SendPasswordReset(email, resetURL)
}

func (a *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error {
	if err := ValidatePassword(newPassword); err != nil {
		return err
	}
	hash := HashToken(token)
	var userID string
	err := a.db.QueryRow(ctx, `
		SELECT user_id FROM password_reset_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, hash).Scan(&userID)
	if err != nil {
		return fmt.Errorf("invalid or expired token")
	}
	passHash, _ := HashPassword(newPassword)
	_, _ = a.db.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, passHash, userID)
	_, _ = a.db.Exec(ctx, `UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1`, hash)
	_, _ = a.db.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return nil
}

func (a *AuthService) Refresh(ctx context.Context, refreshToken string) (*models.AuthResponse, error) {
	hash := HashToken(refreshToken)
	var sessionID, userID string
	var expiresAt time.Time
	err := a.db.QueryRow(ctx, `
		SELECT id, user_id, expires_at FROM sessions WHERE refresh_hash = $1
	`, hash).Scan(&sessionID, &userID, &expiresAt)
	if err != nil || time.Now().After(expiresAt) {
		return nil, fmt.Errorf("invalid refresh token")
	}

	var orgID string
	_ = a.db.QueryRow(ctx, `
		SELECT org_id FROM organization_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1
	`, userID).Scan(&orgID)

	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}

	_, _ = a.db.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, sessionID)
	return a.issueTokens(ctx, user, org, "", "")
}

func (a *AuthService) issueTokens(ctx context.Context, user models.User, org models.Organization, userAgent, ip string) (*models.AuthResponse, error) {
	var role string
	_ = a.db.QueryRow(ctx, `
		SELECT role::text FROM organization_members WHERE user_id = $1 AND org_id = $2
	`, user.ID, org.ID).Scan(&role)
	if role == "" {
		role = "member"
	}
	accessToken, err := a.signAccessToken(user.ID, user.Email, org.ID, role)
	if err != nil {
		return nil, err
	}

	refreshRaw, err := GenerateToken(32)
	if err != nil {
		return nil, err
	}
	refreshHash := HashToken(refreshRaw)
	sessionID := uuid.New().String()
	expires := RefreshExpiry(a.cfg.RefreshTokenTTLDays)

	_, err = a.db.Exec(ctx, `
		INSERT INTO sessions (id, user_id, refresh_hash, user_agent, ip_address, expires_at)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,'')::inet, $6)
	`, sessionID, user.ID, refreshHash, userAgent, ip, expires)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshRaw,
		User:         user,
		Organization: org,
	}, nil
}

func (a *AuthService) signAccessToken(userID, email, orgID, role string) (string, error) {
	claims := middleware.AuthClaims{
		UserID: userID,
		Email:  email,
		OrgID:  orgID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(a.cfg.AccessTokenTTLMin) * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.cfg.JWTSecret))
}

func (a *AuthService) loadUserOrg(ctx context.Context, userID, orgID string) (models.User, models.Organization, error) {
	var user models.User
	err := a.db.QueryRow(ctx, `
		SELECT id, email, display_name, avatar_url, timezone, COALESCE(locale, 'en'), email_verified_at,
		       notify_incidents, COALESCE(notify_daily, false), notify_weekly, notify_product, notify_ssl, COALESCE(onboarding_done, false), created_at
		FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.Timezone, &user.Locale,
		&user.EmailVerifiedAt, &user.NotifyIncidents, &user.NotifyDaily, &user.NotifyWeekly, &user.NotifyProduct, &user.NotifySSL, &user.OnboardingDone, &user.CreatedAt)
	if err != nil {
		return user, models.Organization{}, err
	}

	var org models.Organization
	err = a.db.QueryRow(ctx, `
		SELECT id, name, slug, plan_tier, monitor_quota, seat_quota, founding_member
		FROM organizations WHERE id = $1
	`, orgID).Scan(&org.ID, &org.Name, &org.Slug, &org.PlanTier, &org.MonitorQuota, &org.SeatQuota, &org.FoundingMember)
	return user, org, err
}

func (a *AuthService) sendVerificationEmail(ctx context.Context, userID, email string) error {
	token, err := GenerateToken(32)
	if err != nil {
		return err
	}
	_, _ = a.db.Exec(ctx, `DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL`, userID)
	_, err = a.db.Exec(ctx, `
		INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, now() + interval '24 hours')
	`, uuid.New().String(), userID, HashToken(token))
	if err != nil {
		return err
	}
	url := strings.TrimSuffix(a.cfg.WebURL, "/") + "/verify-email?token=" + token
	return NewEmailService(a.cfg).SendEmailVerification(email, url)
}

func (a *AuthService) VerifyEmail(ctx context.Context, token string) error {
	hash := HashToken(token)
	var userID string
	err := a.db.QueryRow(ctx, `
		SELECT user_id FROM email_verification_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, hash).Scan(&userID)
	if err != nil {
		return fmt.Errorf("invalid or expired token")
	}
	_, _ = a.db.Exec(ctx, `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, userID)
	_, _ = a.db.Exec(ctx, `UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1`, hash)
	return nil
}

func (a *AuthService) ResendVerification(ctx context.Context, userID string) error {
	var email string
	var verifiedAt *time.Time
	err := a.db.QueryRow(ctx, `SELECT email, email_verified_at FROM users WHERE id = $1`, userID).Scan(&email, &verifiedAt)
	if err != nil || verifiedAt != nil {
		return fmt.Errorf("already verified")
	}
	return a.sendVerificationEmail(ctx, userID, email)
}

func (a *AuthService) RequestMagicLink(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	var exists bool
	_ = a.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	if !exists {
		return nil
	}
	token, err := GenerateToken(32)
	if err != nil {
		return err
	}
	_, _ = a.db.Exec(ctx, `DELETE FROM magic_link_tokens WHERE email = $1 AND used_at IS NULL`, email)
	_, _ = a.db.Exec(ctx, `
		INSERT INTO magic_link_tokens (id, email, token_hash, expires_at)
		VALUES ($1, $2, $3, now() + interval '15 minutes')
	`, uuid.New().String(), email, HashToken(token))
	url := strings.TrimSuffix(a.cfg.WebURL, "/") + "/auth/magic?token=" + token
	return NewEmailService(a.cfg).SendMagicLink(email, url)
}

func (a *AuthService) LoginByUserID(ctx context.Context, userID, userAgent, ip string) (*models.AuthResponse, error) {
	var orgID string
	err := a.db.QueryRow(ctx, `
		SELECT org_id FROM organization_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1
	`, userID).Scan(&orgID)
	if err != nil {
		return nil, fmt.Errorf("no organization found")
	}
	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	totpSvc := NewTOTPService(a.db)
	if totpSvc.IsEnabled(ctx, userID) {
		temp, err := a.signTempTotpToken(userID)
		if err != nil {
			return nil, err
		}
		return &models.AuthResponse{RequiresTotp: true, TempToken: temp}, nil
	}
	return a.issueTokens(ctx, user, org, userAgent, ip)
}

func (a *AuthService) VerifyMagicLink(ctx context.Context, token, userAgent, ip string) (*models.AuthResponse, error) {
	hash := HashToken(token)
	var email string
	err := a.db.QueryRow(ctx, `
		SELECT email FROM magic_link_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, hash).Scan(&email)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired link")
	}
	_, _ = a.db.Exec(ctx, `UPDATE magic_link_tokens SET used_at = now() WHERE token_hash = $1`, hash)
	var userID string
	_ = a.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	return a.LoginByUserID(ctx, userID, userAgent, ip)
}

func (a *AuthService) CompleteTotpLogin(ctx context.Context, tempToken, code, userAgent, ip string) (*models.AuthResponse, error) {
	userID, err := a.parseTempTotpToken(tempToken)
	if err != nil {
		return nil, err
	}
	totpSvc := NewTOTPService(a.db)
	if !totpSvc.Validate(ctx, userID, code) {
		return nil, fmt.Errorf("invalid code")
	}
	var orgID string
	err = a.db.QueryRow(ctx, `
		SELECT org_id FROM organization_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1
	`, userID).Scan(&orgID)
	if err != nil {
		return nil, fmt.Errorf("no organization found")
	}
	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	return a.issueTokens(ctx, user, org, userAgent, ip)
}

func (a *AuthService) SwitchOrg(ctx context.Context, userID, orgID, userAgent, ip string) (*models.AuthResponse, error) {
	var exists bool
	_ = a.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	if !exists {
		return nil, fmt.Errorf("not a member of organization")
	}
	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	return a.issueTokens(ctx, user, org, userAgent, ip)
}

func (a *AuthService) signTempTotpToken(userID string) (string, error) {
	claims := middleware.AuthClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			Subject:   userID,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.cfg.JWTSecret + ":totp"))
}

func (a *AuthService) parseTempTotpToken(tokenStr string) (string, error) {
	claims := &middleware.AuthClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(a.cfg.JWTSecret + ":totp"), nil
	})
	if err != nil || !token.Valid || claims.UserID == "" {
		return "", fmt.Errorf("invalid temp token")
	}
	return claims.UserID, nil
}

func IsEmailVerified(ctx context.Context, db *pgxpool.Pool, userID string) bool {
	var verifiedAt *time.Time
	_ = db.QueryRow(ctx, `SELECT email_verified_at FROM users WHERE id = $1`, userID).Scan(&verifiedAt)
	return verifiedAt != nil
}
