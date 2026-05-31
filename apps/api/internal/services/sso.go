package services

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/models"
)

type SSOService struct {
	auth *AuthService
	cfg  *config.Config
	db   *pgxpool.Pool
	http *http.Client
}

func NewSSOService(auth *AuthService, cfg *config.Config, db *pgxpool.Pool) *SSOService {
	return &SSOService{
		auth: auth,
		cfg:  cfg,
		db:   db,
		http: &http.Client{Timeout: 15 * time.Second},
	}
}

type oidcDiscovery struct {
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
}

type ssoOrgConfig struct {
	OrgID        string
	OrgSlug      string
	Issuer       string
	ClientID     string
	ClientSecret string
}

type ssoStateClaims struct {
	OrgSlug string `json:"org"`
	jwt.RegisteredClaims
}

func (s *SSOService) redirectURI() string {
	return strings.TrimSuffix(s.cfg.WebURL, "/") + "/api/v1/auth/sso/callback"
}

func (s *SSOService) signState(orgSlug string) (string, error) {
	claims := ssoStateClaims{
		OrgSlug: orgSlug,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(10 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret + ":sso"))
}

func (s *SSOService) parseState(state string) (string, error) {
	var claims ssoStateClaims
	tok, err := jwt.ParseWithClaims(state, &claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.cfg.JWTSecret + ":sso"), nil
	})
	if err != nil || !tok.Valid || claims.OrgSlug == "" {
		return "", fmt.Errorf("invalid state")
	}
	return claims.OrgSlug, nil
}

func (s *SSOService) loadOrgBySlug(ctx context.Context, slug string) (*ssoOrgConfig, error) {
	var cfg ssoOrgConfig
	err := s.db.QueryRow(ctx, `
		SELECT o.id, o.slug, s.issuer_url, s.client_id, s.client_secret
		FROM org_sso s
		JOIN organizations o ON o.id = s.org_id
		WHERE o.slug = $1 AND s.enabled = true
	`, slug).Scan(&cfg.OrgID, &cfg.OrgSlug, &cfg.Issuer, &cfg.ClientID, &cfg.ClientSecret)
	if err != nil {
		return nil, fmt.Errorf("SSO not configured")
	}
	cfg.Issuer = strings.TrimRight(strings.TrimSpace(cfg.Issuer), "/")
	return &cfg, nil
}

func (s *SSOService) discover(ctx context.Context, issuer string) (*oidcDiscovery, error) {
	discURL := issuer + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("oidc discovery failed")
	}
	var disc oidcDiscovery
	if err := json.NewDecoder(resp.Body).Decode(&disc); err != nil {
		return nil, err
	}
	if disc.AuthorizationEndpoint == "" || disc.TokenEndpoint == "" {
		return nil, fmt.Errorf("incomplete oidc discovery")
	}
	return &disc, nil
}

func (s *SSOService) AuthRedirectURL(ctx context.Context, orgSlug string) (string, error) {
	cfg, err := s.loadOrgBySlug(ctx, orgSlug)
	if err != nil {
		return "", err
	}
	disc, err := s.discover(ctx, cfg.Issuer)
	if err != nil {
		return "", err
	}
	state, err := s.signState(orgSlug)
	if err != nil {
		return "", err
	}
	nonce := randomState()
	q := url.Values{}
	q.Set("client_id", cfg.ClientID)
	q.Set("redirect_uri", s.redirectURI())
	q.Set("response_type", "code")
	q.Set("scope", "openid email profile")
	q.Set("state", state)
	q.Set("nonce", nonce)
	return disc.AuthorizationEndpoint + "?" + q.Encode(), nil
}

func (s *SSOService) HandleCallback(ctx context.Context, code, state, userAgent, ip string) (*models.AuthResponse, string, error) {
	orgSlug, err := s.parseState(state)
	if err != nil {
		return nil, "", err
	}
	cfg, err := s.loadOrgBySlug(ctx, orgSlug)
	if err != nil {
		return nil, "", err
	}
	disc, err := s.discover(ctx, cfg.Issuer)
	if err != nil {
		return nil, "", err
	}
	tok, err := s.exchangeCode(ctx, disc.TokenEndpoint, cfg, code)
	if err != nil {
		return nil, "", err
	}
	email, name, sub, err := s.fetchUserinfo(ctx, disc, tok)
	if err != nil {
		return nil, "", err
	}
	provider := "sso:" + cfg.OrgID
	resp, err := s.auth.LoginOrRegisterSSO(ctx, cfg.OrgID, provider, sub, email, name, userAgent, ip)
	if err != nil {
		return nil, "", err
	}
	redirect := strings.TrimSuffix(s.cfg.WebURL, "/") + "/auth/callback"
	return resp, redirect, nil
}

func (s *SSOService) exchangeCode(ctx context.Context, tokenURL string, cfg *ssoOrgConfig, code string) (map[string]interface{}, error) {
	body := url.Values{}
	body.Set("grant_type", "authorization_code")
	body.Set("code", code)
	body.Set("redirect_uri", s.redirectURI())
	body.Set("client_id", cfg.ClientID)
	body.Set("client_secret", cfg.ClientSecret)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("token exchange failed")
	}
	var tok map[string]interface{}
	if err := json.Unmarshal(b, &tok); err != nil {
		return nil, err
	}
	return tok, nil
}

func (s *SSOService) fetchUserinfo(ctx context.Context, disc *oidcDiscovery, tok map[string]interface{}) (email, name, sub string, err error) {
	if v, ok := tok["id_token"].(string); ok && v != "" {
		parts := strings.Split(v, ".")
		if len(parts) >= 2 {
			payload, decErr := base64.RawURLEncoding.DecodeString(parts[1])
			if decErr == nil {
				var claims map[string]interface{}
				if json.Unmarshal(payload, &claims) == nil {
					email, name, sub = claimsEmailNameSub(claims)
					if email != "" && sub != "" {
						return email, name, sub, nil
					}
				}
			}
		}
	}
	userinfoURL := disc.UserinfoEndpoint
	if userinfoURL == "" {
		return "", "", "", fmt.Errorf("no userinfo endpoint")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userinfoURL, nil)
	if err != nil {
		return "", "", "", err
	}
	if access, ok := tok["access_token"].(string); ok {
		req.Header.Set("Authorization", "Bearer "+access)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", "", "", fmt.Errorf("userinfo failed")
	}
	var claims map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return "", "", "", err
	}
	email, name, sub = claimsEmailNameSub(claims)
	if email == "" || sub == "" {
		return "", "", "", fmt.Errorf("email or subject missing from IdP")
	}
	return email, name, sub, nil
}

func claimsEmailNameSub(claims map[string]interface{}) (email, name, sub string) {
	if v, ok := claims["email"].(string); ok {
		email = strings.ToLower(strings.TrimSpace(v))
	}
	if v, ok := claims["sub"].(string); ok {
		sub = v
	}
	if v, ok := claims["name"].(string); ok {
		name = v
	}
	return email, name, sub
}
