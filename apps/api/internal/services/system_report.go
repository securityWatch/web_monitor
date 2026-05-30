package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type SystemReport struct {
	Period           string                 `json:"period"`
	Days             int                    `json:"days"`
	GeneratedAt      time.Time              `json:"generatedAt"`
	MonitorCount     int                    `json:"monitorCount"`
	UpMonitors       int                    `json:"upMonitors"`
	DownMonitors     int                    `json:"downMonitors"`
	PausedMonitors   int                    `json:"pausedMonitors"`
	TotalChecks      int                    `json:"totalChecks"`
	FailedChecks     int                    `json:"failedChecks"`
	UptimePct        float64                `json:"uptimePct"`
	AvgResponseMs    float64                `json:"avgResponseMs"`
	IncidentCount    int                    `json:"incidentCount"`
	OpenIncidents    int                    `json:"openIncidents"`
	SecurityFindings int                    `json:"securityFindings"`
	Monitors         []SystemReportMonitor  `json:"monitors"`
	Incidents        []SystemReportIncident `json:"incidents"`
	RecentFailures   []SystemReportFailure  `json:"recentFailures"`
	AISummary        *AISecurityReport      `json:"aiSummary,omitempty"`
}

type SystemReportMonitor struct {
	Name         string  `json:"name"`
	Type         string  `json:"type"`
	Status       string  `json:"status"`
	TotalChecks  int     `json:"totalChecks"`
	FailedChecks int     `json:"failedChecks"`
	UptimePct    float64 `json:"uptimePct"`
	AvgMs        float64 `json:"avgMs"`
}

type SystemReportIncident struct {
	Title      string     `json:"title"`
	Monitor    string     `json:"monitor"`
	Status     string     `json:"status"`
	Severity   string     `json:"severity"`
	StartedAt  time.Time  `json:"startedAt"`
	ResolvedAt *time.Time `json:"resolvedAt,omitempty"`
	Message    string     `json:"message"`
}

type SystemReportFailure struct {
	Monitor   string    `json:"monitor"`
	CheckedAt time.Time `json:"checkedAt"`
	Error     string    `json:"error"`
}

func ReportDays(period string) int {
	switch strings.ToLower(period) {
	case "daily", "day", "24h":
		return 1
	case "monthly", "month", "30d":
		return 30
	default:
		return 7
	}
}

func BuildSystemReport(ctx context.Context, db *pgxpool.Pool, orgID, period string, includeAI bool) (SystemReport, error) {
	days := ReportDays(period)
	if period == "" {
		period = "weekly"
	}
	r := SystemReport{Period: period, Days: days, GeneratedAt: time.Now().UTC()}

	err := db.QueryRow(ctx, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE status = 'up'),
		       COUNT(*) FILTER (WHERE status = 'down'),
		       COUNT(*) FILTER (WHERE status = 'paused')
		FROM monitors WHERE org_id = $1
	`, orgID).Scan(&r.MonitorCount, &r.UpMonitors, &r.DownMonitors, &r.PausedMonitors)
	if err != nil {
		return r, err
	}
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE NOT is_up),
		       COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0), 2), 100),
		       COALESCE(ROUND(AVG(response_ms)::numeric, 0), 0),
		       COUNT(*) FILTER (WHERE metadata ? 'tamperAIContentViolation' OR metadata ? 'tamperPolicyViolation' OR metadata ? 'dnsChanged' OR metadata ? 'sslDaysLeft')
		FROM check_results
		WHERE org_id = $1 AND checked_at > now() - ($2 || ' days')::interval
	`, orgID, fmt.Sprintf("%d", days)).Scan(&r.TotalChecks, &r.FailedChecks, &r.UptimePct, &r.AvgResponseMs, &r.SecurityFindings)
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'open')
		FROM incidents WHERE org_id = $1 AND started_at > now() - ($2 || ' days')::interval
	`, orgID, fmt.Sprintf("%d", days)).Scan(&r.IncidentCount, &r.OpenIncidents)

	r.Monitors = loadSystemReportMonitors(ctx, db, orgID, days)
	r.Incidents = loadSystemReportIncidents(ctx, db, orgID, days)
	r.RecentFailures = loadSystemReportFailures(ctx, db, orgID, days)
	if includeAI && deepSeekConfigured() {
		ai, err := GenerateAISecurityReport(ctx, SystemReportAIInput(r))
		if err == nil {
			r.AISummary = &ai
			RecordAIUsage(ctx, db, orgID, "system_report_ai", "ok", period)
		} else {
			RecordAIUsage(ctx, db, orgID, "system_report_ai", "error", err.Error())
		}
	}
	return r, nil
}

func loadSystemReportMonitors(ctx context.Context, db *pgxpool.Pool, orgID string, days int) []SystemReportMonitor {
	rows, err := db.Query(ctx, `
		SELECT m.name, m.type, m.status,
		       COUNT(cr.id),
		       COUNT(cr.id) FILTER (WHERE cr.is_up = false),
		       COALESCE(ROUND(100.0 * COUNT(cr.id) FILTER (WHERE cr.is_up) / NULLIF(COUNT(cr.id), 0), 2), 100),
		       COALESCE(ROUND(AVG(cr.response_ms)::numeric, 0), 0)
		FROM monitors m
		LEFT JOIN check_results cr ON cr.monitor_id = m.id AND cr.checked_at > now() - ($2 || ' days')::interval
		WHERE m.org_id = $1
		GROUP BY m.id, m.name, m.type, m.status
		ORDER BY COUNT(cr.id) FILTER (WHERE cr.is_up = false) DESC, m.name
		LIMIT 50
	`, orgID, fmt.Sprintf("%d", days))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []SystemReportMonitor
	for rows.Next() {
		var m SystemReportMonitor
		if rows.Scan(&m.Name, &m.Type, &m.Status, &m.TotalChecks, &m.FailedChecks, &m.UptimePct, &m.AvgMs) == nil {
			out = append(out, m)
		}
	}
	return out
}

func loadSystemReportIncidents(ctx context.Context, db *pgxpool.Pool, orgID string, days int) []SystemReportIncident {
	rows, err := db.Query(ctx, `
		SELECT COALESCE(i.title, m.name), m.name, i.status, i.severity, i.started_at, i.resolved_at, COALESCE(i.message, '')
		FROM incidents i JOIN monitors m ON m.id = i.monitor_id
		WHERE i.org_id = $1 AND i.started_at > now() - ($2 || ' days')::interval
		ORDER BY i.started_at DESC LIMIT 20
	`, orgID, fmt.Sprintf("%d", days))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []SystemReportIncident
	for rows.Next() {
		var inc SystemReportIncident
		if rows.Scan(&inc.Title, &inc.Monitor, &inc.Status, &inc.Severity, &inc.StartedAt, &inc.ResolvedAt, &inc.Message) == nil {
			out = append(out, inc)
		}
	}
	return out
}

func loadSystemReportFailures(ctx context.Context, db *pgxpool.Pool, orgID string, days int) []SystemReportFailure {
	rows, err := db.Query(ctx, `
		SELECT m.name, cr.checked_at, COALESCE(cr.error_message, '')
		FROM check_results cr JOIN monitors m ON m.id = cr.monitor_id
		WHERE cr.org_id = $1 AND cr.checked_at > now() - ($2 || ' days')::interval AND cr.is_up = false
		ORDER BY cr.checked_at DESC LIMIT 20
	`, orgID, fmt.Sprintf("%d", days))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []SystemReportFailure
	for rows.Next() {
		var f SystemReportFailure
		if rows.Scan(&f.Monitor, &f.CheckedAt, &f.Error) == nil {
			out = append(out, f)
		}
	}
	return out
}

func SystemReportAIInput(r SystemReport) string {
	return fmt.Sprintf("System report period=%s days=%d monitors=%d up=%d down=%d paused=%d checks=%d failed=%d uptime=%.2f avgMs=%.0f incidents=%d openIncidents=%d securityFindings=%d",
		r.Period, r.Days, r.MonitorCount, r.UpMonitors, r.DownMonitors, r.PausedMonitors, r.TotalChecks, r.FailedChecks, r.UptimePct, r.AvgResponseMs, r.IncidentCount, r.OpenIncidents, r.SecurityFindings)
}

func FormatSystemReportHTML(r SystemReport) string {
	ai := ""
	if r.AISummary != nil {
		ai = fmt.Sprintf("<h3>AI Summary</h3><p>%s</p>", r.AISummary.Summary)
	}
	return fmt.Sprintf(`<div style="font-family:sans-serif;max-width:720px">
<h2>PulseWatch %s report</h2>
<p>Generated at %s</p>
<ul>
<li>Monitors: %d total, %d up, %d down, %d paused</li>
<li>Uptime: %.2f%% over %d checks</li>
<li>Failures: %d failed checks, %d incidents (%d open)</li>
<li>Average response: %.0fms</li>
<li>Security findings: %d</li>
</ul>%s
</div>`, r.Period, r.GeneratedAt.Format(time.RFC3339), r.MonitorCount, r.UpMonitors, r.DownMonitors, r.PausedMonitors, r.UptimePct, r.TotalChecks, r.FailedChecks, r.IncidentCount, r.OpenIncidents, r.AvgResponseMs, r.SecurityFindings, ai)
}
