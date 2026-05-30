package services

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SecurityEvents handles post-check SSL tier alerts, DNS drift, and tamper events.
type SecurityEvents struct {
	db        *pgxpool.Pool
	alerts    *AlertService
	incidents *IncidentService
}

func NewSecurityEvents(db *pgxpool.Pool, alerts *AlertService, incidents *IncidentService) *SecurityEvents {
	return &SecurityEvents{db: db, alerts: alerts, incidents: incidents}
}

func (se *SecurityEvents) AfterCheck(ctx context.Context, monitorID, orgID, name, mType string, config json.RawMessage, outcome CheckOutcome) {
	if IsInMaintenance(ctx, se.db, orgID, monitorID) {
		return
	}

	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)

	se.applyBaselineUpdates(ctx, monitorID, cfg, outcome.Metadata)

	if days, ok := intFromMeta(outcome.Metadata, "sslDaysLeft"); ok {
		se.handleSSLWarning(ctx, monitorID, orgID, name, cfg, days)
	}

	if outcome.Metadata["dnsChanged"] == true {
		prev, _ := outcome.Metadata["previous"]
		curr, _ := outcome.Metadata["current"]
		rt, _ := outcome.Metadata["recordType"].(string)
		detail := formatDNSChangeDetail(rt, prev, curr)
		se.alerts.NotifySecurityEvent(ctx, orgID, monitorID, name, "dns_change", detail)
		se.openSecurityIncident(ctx, orgID, monitorID, name, detail)
	}

	if outcome.Metadata["tamperMajorChange"] == true {
		detail, _ := outcome.Metadata["diffSummary"].(string)
		if detail == "" {
			detail = "Major content change detected"
		}
		se.alerts.NotifySecurityEvent(ctx, orgID, monitorID, name, "tamper_major_change", detail)
		se.openSecurityIncident(ctx, orgID, monitorID, name, detail)
	}

	if outcome.Metadata["tamperPolicyViolation"] == true {
		detail, _ := outcome.Metadata["policySummary"].(string)
		if detail == "" {
			detail = "Content policy violation detected"
		}
		if matched, ok := outcome.Metadata["matchedKeywords"].([]string); ok && len(matched) > 0 {
			detail += ": " + joinLimited(matched, 5)
		}
		se.alerts.NotifySecurityEvent(ctx, orgID, monitorID, name, "tamper_policy_violation", detail)
		se.openSecurityIncident(ctx, orgID, monitorID, name, detail)
	}

	if outcome.Metadata["tamperAIContentViolation"] == true {
		detail, _ := outcome.Metadata["aiPolicySummary"].(string)
		if detail == "" {
			detail = "AI content risk detected"
		}
		se.alerts.NotifySecurityEvent(ctx, orgID, monitorID, name, "tamper_ai_content_violation", detail)
		se.openSecurityIncident(ctx, orgID, monitorID, name, detail)
	}
}

func (se *SecurityEvents) applyBaselineUpdates(ctx context.Context, monitorID string, cfg map[string]interface{}, meta map[string]interface{}) {
	if meta == nil {
		return
	}
	patch := map[string]interface{}{}

	if meta["establishBaseline"] == true {
		if recs, ok := meta["dnsBaselineRecords"].([]string); ok {
			patch["dnsBaseline"] = recs
			patch["dnsBaselineRecords"] = recs
		} else if raw, ok := meta["records"].([]string); ok {
			patch["dnsBaseline"] = raw
			patch["dnsBaselineRecords"] = raw
		}
		if h, ok := meta["baselineHash"].(string); ok && patch["dnsBaseline"] != nil {
			patch["baselineHash"] = h
		}
		if h, ok := meta["bodyHash"].(string); ok {
			patch["baselineHash"] = h
			if s, ok := meta["contentBytes"].(int); ok {
				patch["baselineSize"] = s
			}
			patch["baselineCapturedAt"] = meta["baselineCapturedAt"]
		}
	}

	if len(patch) == 0 {
		return
	}
	merged := mergeConfigMap(cfg, patch)
	b, err := json.Marshal(merged)
	if err != nil {
		return
	}
	_, err = se.db.Exec(ctx, `UPDATE monitors SET config = $1::jsonb, updated_at = now() WHERE id = $2`, string(b), monitorID)
	if err != nil {
		log.Printf("baseline config update: %v", err)
	}
}

func (se *SecurityEvents) handleSSLWarning(ctx context.Context, monitorID, orgID, name string, cfg map[string]interface{}, daysLeft int) {
	warnDays := sslWarnDaysFromConfig(cfg)
	lastTier := lastSSLWarningTier(cfg)
	tier, fire := shouldFireSSLWarning(daysLeft, warnDays, lastTier)
	if !fire {
		return
	}
	detail := sslWarningDetail(daysLeft, tier)
	se.alerts.NotifySecurityEvent(ctx, orgID, monitorID, name, "ssl_warning", detail)

	patch := map[string]interface{}{"lastSslWarningTier": tier}
	merged := mergeConfigMap(cfg, patch)
	b, _ := json.Marshal(merged)
	_, _ = se.db.Exec(ctx, `UPDATE monitors SET config = $1::jsonb, updated_at = now() WHERE id = $2`, string(b), monitorID)
}

func (se *SecurityEvents) openSecurityIncident(ctx context.Context, orgID, monitorID, name, detail string) {
	if se.incidents == nil {
		return
	}
	_, _, err := se.incidents.CreateOrMerge(ctx, orgID, monitorID, name, detail)
	if err != nil {
		log.Printf("security incident: %v", err)
	}
}

func mergeConfigMap(base map[string]interface{}, patch map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range patch {
		if v != nil {
			out[k] = v
		}
	}
	return out
}

func intFromMeta(m map[string]interface{}, key string) (int, bool) {
	if m == nil {
		return 0, false
	}
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

func formatDNSChangeDetail(recordType string, previous, current interface{}) string {
	pj, _ := json.Marshal(previous)
	cj, _ := json.Marshal(current)
	return recordType + " records changed: " + string(pj) + " → " + string(cj)
}

func joinLimited(items []string, max int) string {
	if len(items) > max {
		items = items[:max]
	}
	return stringsJoin(items, ", ")
}

func stringsJoin(items []string, sep string) string {
	if len(items) == 0 {
		return ""
	}
	out := items[0]
	for i := 1; i < len(items); i++ {
		out += sep + items[i]
	}
	return out
}
