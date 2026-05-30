package services

import (
	"context"
	"log"
	"time"
)

func (s *Scheduler) processOnCallEscalation(ctx context.Context) {
	rows, err := s.db.Query(ctx, `
		SELECT oca.id, oca.org_id, oca.incident_id, oca.escalation_level, oca.created_at,
		       ocs.escalation_minutes, i.title
		FROM on_call_alerts oca
		JOIN on_call_schedules ocs ON ocs.id = oca.schedule_id
		JOIN incidents i ON i.id = oca.incident_id
		WHERE oca.acked_at IS NULL AND oca.escalated_at IS NULL AND i.status = 'open'
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	oncall := NewOnCallService(s.db)
	for rows.Next() {
		var alertID, orgID, incidentID, title string
		var level, escMinutes int
		var createdAt time.Time
		if err := rows.Scan(&alertID, &orgID, &incidentID, &level, &createdAt, &escMinutes, &title); err != nil {
			continue
		}
		if escMinutes <= 0 {
			escMinutes = 15
		}
		if time.Since(createdAt) < time.Duration(escMinutes)*time.Minute {
			continue
		}
		nextLevel := level + 1
		user := oncall.CurrentOnCall(ctx, orgID, nextLevel)
		if user == nil {
			continue
		}
		_, _ = s.db.Exec(ctx, `UPDATE on_call_alerts SET escalated_at = now() WHERE id = $1`, alertID)
		msg := "On-call escalation L" + itoa(nextLevel) + ": " + title
		s.alerts.NotifyOnCallEscalation(ctx, orgID, user.Email, user.Phone, msg)
		log.Printf("[ONCALL] Escalated incident %s to L%d (%s)", incidentID, nextLevel, user.Email)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
