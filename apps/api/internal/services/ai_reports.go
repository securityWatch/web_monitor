package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func BuildAISecurityReportInput(ctx context.Context, db *pgxpool.Pool, orgID string) string {
	var monitorCount, downCount, checks, failedChecks, incidents, securityFindings int
	_ = db.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'down') FROM monitors WHERE org_id = $1`, orgID).Scan(&monitorCount, &downCount)
	_ = db.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT is_up) FROM check_results WHERE org_id = $1 AND checked_at > now() - interval '7 days'`, orgID).Scan(&checks, &failedChecks)
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM incidents WHERE org_id = $1 AND started_at > now() - interval '7 days'`, orgID).Scan(&incidents)
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*) FROM check_results
		WHERE org_id = $1 AND checked_at > now() - interval '7 days'
		  AND (metadata ? 'tamperAIContentViolation' OR metadata ? 'tamperPolicyViolation' OR metadata ? 'dnsChanged' OR metadata ? 'sslDaysLeft')
	`, orgID).Scan(&securityFindings)

	rows, _ := db.Query(ctx, `
		SELECT m.name, m.type, cr.checked_at, cr.is_up, cr.error_message, cr.metadata
		FROM check_results cr
		JOIN monitors m ON m.id = cr.monitor_id
		WHERE cr.org_id = $1 AND cr.checked_at > now() - interval '7 days' AND (NOT cr.is_up OR cr.error_message IS NOT NULL)
		ORDER BY cr.checked_at DESC LIMIT 20
	`, orgID)
	var recent []string
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name, mType string
			var checked time.Time
			var isUp bool
			var errMsg *string
			var meta []byte
			if rows.Scan(&name, &mType, &checked, &isUp, &errMsg, &meta) == nil {
				msg := ""
				if errMsg != nil {
					msg = *errMsg
				}
				recent = append(recent, fmt.Sprintf("%s %s/%s up=%v error=%s metadata=%s", checked.Format(time.RFC3339), name, mType, isUp, msg, string(meta)))
			}
		}
	}
	return fmt.Sprintf("7d stats: monitors=%d downNow=%d checks=%d failedChecks=%d incidents=%d securityFindings=%d\nRecent failures:\n%s",
		monitorCount, downCount, checks, failedChecks, incidents, securityFindings, strings.Join(recent, "\n"))
}

func FormatAISecurityReportHTML(r AISecurityReport) string {
	list := func(items []string) string {
		if len(items) == 0 {
			return "<li>None</li>"
		}
		out := ""
		for _, item := range items {
			out += "<li>" + item + "</li>"
		}
		return out
	}
	return fmt.Sprintf(`<div style="font-family:sans-serif;max-width:640px">
<h2>%s</h2>
<p>%s</p>
<h3>Risks</h3><ul>%s</ul>
<h3>Wins</h3><ul>%s</ul>
<h3>Next actions</h3><ul>%s</ul>
<p><strong>Customer brief:</strong> %s</p>
</div>`, r.Headline, r.Summary, list(r.Risks), list(r.Wins), list(r.NextActions), r.CustomerBrief)
}
