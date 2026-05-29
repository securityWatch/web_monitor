package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/models"
	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
	googleoauth "golang.org/x/oauth2/google"
)

type OAuthService struct {
	auth *AuthService
	cfg  *config.Config
}

func NewOAuthService(auth *AuthService, cfg *config.Config) *OAuthService {
	return &OAuthService{auth: auth, cfg: cfg}
}

func (o *OAuthService) Config(provider string) (*oauth2.Config, error) {
	base := o.cfg.OAuthRedirectURL
	if base == "" {
		base = strings.TrimSuffix(o.cfg.WebURL, "/") + "/api/v1/auth/oauth"
	}
	switch provider {
	case "google":
		if o.cfg.GoogleClientID == "" {
			return nil, fmt.Errorf("google oauth not configured")
		}
		return &oauth2.Config{
			ClientID:     o.cfg.GoogleClientID,
			ClientSecret: o.cfg.GoogleClientSecret,
			RedirectURL:  base + "/google/callback",
			Scopes:       []string{"email", "profile"},
			Endpoint:     googleoauth.Endpoint,
		}, nil
	case "github":
		if o.cfg.GitHubClientID == "" {
			return nil, fmt.Errorf("github oauth not configured")
		}
		return &oauth2.Config{
			ClientID:     o.cfg.GitHubClientID,
			ClientSecret: o.cfg.GitHubClientSecret,
			RedirectURL:  base + "/github/callback",
			Scopes:       []string{"user:email"},
			Endpoint:     githuboauth.Endpoint,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported provider")
	}
}

func (o *OAuthService) AuthURL(provider string) (string, error) {
	cfg, err := o.Config(provider)
	if err != nil {
		return "", err
	}
	state := randomState()
	return cfg.AuthCodeURL(state, oauth2.AccessTypeOnline), nil
}

func (o *OAuthService) HandleCallback(ctx context.Context, provider, code, userAgent, ip string) (*models.AuthResponse, string, error) {
	cfg, err := o.Config(provider)
	if err != nil {
		return nil, "", err
	}
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, "", fmt.Errorf("oauth exchange failed")
	}

	email, name, avatar, providerUID, err := o.fetchProfile(provider, tok)
	if err != nil {
		return nil, "", err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil, "", fmt.Errorf("email not available from provider")
	}

	resp, err := o.auth.LoginOrRegisterOAuth(ctx, provider, providerUID, email, name, avatar, userAgent, ip)
	if err != nil {
		return nil, "", err
	}
	redirect := strings.TrimSuffix(o.cfg.WebURL, "/") + "/auth/callback"
	return resp, redirect, nil
}

func (o *OAuthService) fetchProfile(provider string, tok *oauth2.Token) (email, name, avatar, uid string, err error) {
	client := oauth2.NewClient(context.Background(), oauth2.StaticTokenSource(tok))
	switch provider {
	case "google":
		res, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
		if err != nil {
			return "", "", "", "", err
		}
		defer res.Body.Close()
		var data struct {
			ID      string `json:"id"`
			Email   string `json:"email"`
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
			return "", "", "", "", err
		}
		return data.Email, data.Name, data.Picture, data.ID, nil
	case "github":
		res, err := client.Get("https://api.github.com/user")
		if err != nil {
			return "", "", "", "", err
		}
		defer res.Body.Close()
		var data struct {
			ID        int    `json:"id"`
			Login     string `json:"login"`
			Name      string `json:"name"`
			AvatarURL string `json:"avatar_url"`
			Email     string `json:"email"`
		}
		if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
			return "", "", "", "", err
		}
		email := data.Email
		if email == "" {
			eres, err := client.Get("https://api.github.com/user/emails")
			if err == nil {
				defer eres.Body.Close()
				var emails []struct {
					Email   string `json:"email"`
					Primary bool   `json:"primary"`
				}
				_ = json.NewDecoder(eres.Body).Decode(&emails)
				for _, e := range emails {
					if e.Primary {
						email = e.Email
						break
					}
				}
				if email == "" && len(emails) > 0 {
					email = emails[0].Email
				}
			}
		}
		name := data.Name
		if name == "" {
			name = data.Login
		}
		return email, name, data.AvatarURL, fmt.Sprintf("%d", data.ID), nil
	}
	return "", "", "", "", fmt.Errorf("unsupported provider")
}

func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
