package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReportHandler struct {
	db *pgxpool.Pool
}

func NewReportHandler(db *pgxpool.Pool) *ReportHandler {
	return &ReportHandler{db: db}
}

func (h *ReportHandler) SLAExport(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	days := 30
	if d := c.Query("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT m.name, m.type,
		       COUNT(*) AS total_checks,
		       COUNT(*) FILTER (WHERE cr.is_up) AS up_checks,
		       ROUND(100.0 * COUNT(*) FILTER (WHERE cr.is_up) / NULLIF(COUNT(*), 0), 2) AS uptime_pct,
		       ROUND(AVG(cr.response_ms)::numeric, 0) AS avg_ms
		FROM monitors m
		LEFT JOIN check_results cr ON cr.monitor_id = m.id AND cr.checked_at > now() - ($2 || ' days')::interval
		WHERE m.org_id = $1
		GROUP BY m.id, m.name, m.type
		ORDER BY m.name
	`, orgID, strconv.Itoa(days))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=sla-report-%s.csv", time.Now().Format("2006-01-02")))
	c.String(http.StatusOK, "monitor,type,total_checks,up_checks,uptime_pct,avg_response_ms\n")
	for rows.Next() {
		var name, mType string
		var total, up int
		var uptime, avgMs *float64
		if err := rows.Scan(&name, &mType, &total, &up, &uptime, &avgMs); err != nil {
			continue
		}
		upPct := "0"
		if uptime != nil {
			upPct = fmt.Sprintf("%.2f", *uptime)
		}
		avg := "0"
		if avgMs != nil {
			avg = fmt.Sprintf("%.0f", *avgMs)
		}
		c.String(http.StatusOK, "%q,%s,%d,%d,%s,%s\n", name, mType, total, up, upPct, avg)
	}
}

func (h *ReportHandler) SLAReportHTML(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	days := 30
	rows, _ := h.db.Query(c.Request.Context(), `
		SELECT m.name,
		       ROUND(100.0 * COUNT(*) FILTER (WHERE cr.is_up) / NULLIF(COUNT(*), 0), 2) AS uptime_pct
		FROM monitors m
		LEFT JOIN check_results cr ON cr.monitor_id = m.id AND cr.checked_at > now() - interval '30 days'
		WHERE m.org_id = $1
		GROUP BY m.id, m.name ORDER BY m.name
	`, orgID)
	defer rows.Close()
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SLA Report</title>
<style>body{font-family:sans-serif;padding:2rem}table{border-collapse:collapse;width:100%%}th,td{border:1px solid #ddd;padding:8px}</style></head><body>
<h1>SLA Report (%d days)</h1><table><tr><th>Monitor</th><th>Uptime %%</th></tr>`, days)
	for rows.Next() {
		var name string
		var uptime *float64
		if rows.Scan(&name, &uptime) != nil {
			continue
		}
		pct := "100.00"
		if uptime != nil {
			pct = fmt.Sprintf("%.2f", *uptime)
		}
		c.String(http.StatusOK, "<tr><td>%s</td><td>%s</td></tr>", name, pct)
	}
	c.String(http.StatusOK, "</table><p>Generated %s</p></body></html>", time.Now().Format(time.RFC3339))
}
