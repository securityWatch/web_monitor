package services

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type OnCallUser struct {
	UserID string
	Email  string
	Phone  string
	Level  int
}

type OnCallService struct {
	db *pgxpool.Pool
}

func NewOnCallService(db *pgxpool.Pool) *OnCallService {
	return &OnCallService{db: db}
}

func (o *OnCallService) CurrentOnCall(ctx context.Context, orgID string, level int) *OnCallUser {
	var scheduleID string
	err := o.db.QueryRow(ctx, `
		SELECT id FROM on_call_schedules WHERE org_id = $1 AND enabled = true ORDER BY created_at LIMIT 1
	`, orgID).Scan(&scheduleID)
	if err != nil {
		return nil
	}

	rows, err := o.db.Query(ctx, `
		SELECT r.user_id, u.email, COALESCE(r.escalation_level, 1)
		FROM on_call_rotations r
		JOIN users u ON u.id = r.user_id
		WHERE r.schedule_id = $1 AND r.escalation_level = $2
		ORDER BY r.position
	`, scheduleID, level)
	if err != nil {
		return nil
	}
	defer rows.Close()

	type rot struct {
		userID string
		email  string
		level  int
	}
	var rots []rot
	for rows.Next() {
		var r rot
		if rows.Scan(&r.userID, &r.email, &r.level) == nil {
			rots = append(rots, r)
		}
	}
	if len(rots) == 0 {
		return nil
	}

	dayIndex := time.Now().UTC().YearDay()
	idx := dayIndex % len(rots)
	u := rots[idx]

	var phone string
	_ = o.db.QueryRow(ctx, `
		SELECT COALESCE(ac.config->>'phone', '') FROM alert_channels ac
		WHERE ac.org_id = $1 AND ac.type = 'sms' AND ac.enabled = true
		LIMIT 1
	`, orgID).Scan(&phone)

	return &OnCallUser{UserID: u.userID, Email: u.email, Phone: phone, Level: u.level}
}
