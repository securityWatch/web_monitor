package services

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func LogAudit(ctx context.Context, db *pgxpool.Pool, orgID, userID, action, ip string, details map[string]interface{}) {
	var detailsJSON []byte
	if details != nil {
		detailsJSON, _ = json.Marshal(details)
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO audit_logs (id, org_id, user_id, action, details, ip_address)
		VALUES ($1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5::jsonb, NULLIF($6, ''))
	`, uuid.New().String(), orgID, userID, action, string(detailsJSON), ip)
}
