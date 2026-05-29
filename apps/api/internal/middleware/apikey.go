package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const apiKeyPrefix = "pw_live_"

type APIKeyAuth struct {
	KeyID  string
	OrgID  string
	UserID string
	Scope  string
	Role   string
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func AuthenticateAPIKey(ctx context.Context, db *pgxpool.Pool, token string) (*APIKeyAuth, error) {
	if !strings.HasPrefix(token, apiKeyPrefix) {
		return nil, fmt.Errorf("not an api key")
	}
	hash := hashToken(token)
	var auth APIKeyAuth
	var createdBy *string
	err := db.QueryRow(ctx, `
		SELECT k.id, k.org_id, k.scope::text, k.created_by
		FROM api_keys k
		WHERE k.key_hash = $1 AND (k.expires_at IS NULL OR k.expires_at > now())
	`, hash).Scan(&auth.KeyID, &auth.OrgID, &auth.Scope, &createdBy)
	if err != nil {
		return nil, fmt.Errorf("invalid api key")
	}
	if createdBy != nil {
		auth.UserID = *createdBy
	}
	switch auth.Scope {
	case "admin":
		auth.Role = "admin"
	case "write":
		auth.Role = "member"
	default:
		auth.Role = "viewer"
	}
	_, _ = db.Exec(ctx, `UPDATE api_keys SET last_used_at = now() WHERE id = $1`, auth.KeyID)
	return &auth, nil
}
