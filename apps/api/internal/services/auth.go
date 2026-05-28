package services

import (
	"context"
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
	db  *pgxpool.Pool
	cfg *config.Config
}

func NewAuthService(db *pgxpool.Pool, cfg *config.Config) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

func (a *AuthService) Register(ctx context.Context, email, password, displayName string) (*models.AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !ValidateEmail(email) {
		return nil, fmt.Errorf("invalid email")
	}
	if err := ValidatePassword(password); err != nil {
		return nil, err
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

	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	userID := uuid.New().String()
	now := time.Now().UTC()
	_, err = tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, display_name, email_verified_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)
	`, userID, email, hash, displayName, now, now)
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

	// Default email alert channel
	channelID := uuid.New().String()
	channelCfg := fmt.Sprintf(`{"email":"%s"}`, email)
	_, err = tx.Exec(ctx, `
		INSERT INTO alert_channels (id, org_id, name, type, config, enabled)
		VALUES ($1, $2, 'Default Email', 'email', $3::jsonb, true)
	`, channelID, orgID, channelCfg)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	user, org, err := a.loadUserOrg(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}

	return a.issueTokens(ctx, user, org, "", "")
}

func (a *AuthService) Login(ctx context.Context, email, password, userAgent, ip string) (*models.AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var userID, passHash string
	err := a.db.QueryRow(ctx, `
		SELECT id, COALESCE(password_hash, '') FROM users WHERE email = $1
	`, email).Scan(&userID, &passHash)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if passHash == "" || !CheckPassword(passHash, password) {
		return nil, fmt.Errorf("invalid credentials")
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
	accessToken, err := a.signAccessToken(user.ID, user.Email, org.ID, "owner")
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
		       notify_incidents, notify_weekly, notify_product, notify_ssl, created_at
		FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.Timezone, &user.Locale,
		&user.EmailVerifiedAt, &user.NotifyIncidents, &user.NotifyWeekly, &user.NotifyProduct, &user.NotifySSL, &user.CreatedAt)
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
