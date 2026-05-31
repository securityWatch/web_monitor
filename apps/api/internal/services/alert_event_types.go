package services

import "strings"

var validAlertEventTypes = map[string]bool{
	"all":                         true,
	"down":                        true,
	"up":                          true,
	"security":                    true,
	"ssl_warning":                 true,
	"dns_change":                  true,
	"tamper_major_change":         true,
	"tamper_policy_violation":     true,
	"tamper_ai_content_violation": true,
}

// NormalizeAlertEventTypes deduplicates and validates event types.
// Empty input or "all" yields a single "all" rule. Unknown values are dropped.
func NormalizeAlertEventTypes(types []string, legacySingle string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(v string) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" || !validAlertEventTypes[v] || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}
	for _, t := range types {
		add(t)
	}
	if len(out) == 0 {
		add(legacySingle)
	}
	if len(out) == 0 {
		return []string{"all"}
	}
	for _, t := range out {
		if t == "all" {
			return []string{"all"}
		}
	}
	return out
}

// AlertEventMatchesRule returns whether an incoming event status matches a rule event_type.
func AlertEventMatchesRule(ruleEventType, status string) bool {
	switch ruleEventType {
	case "all":
		return true
	case "down":
		return status == "down"
	case "up":
		return status == "up" || status == "recovery"
	case "security":
		return status == "ssl_warning" || status == "dns_change" ||
			status == "tamper_major_change" || status == "tamper_policy_violation" ||
			status == "tamper_ai_content_violation"
	default:
		return ruleEventType == status
	}
}
