package services

import "encoding/json"

// MonitorWebhookAlertsEnabled returns true when webhook alerts should fire for a monitor.
// Default is true when config is missing or alerts.webhookEnabled is unset.
func MonitorWebhookAlertsEnabled(config json.RawMessage) bool {
	if len(config) == 0 || string(config) == "null" {
		return true
	}
	var root map[string]json.RawMessage
	if json.Unmarshal(config, &root) != nil {
		return true
	}
	alertsRaw, ok := root["alerts"]
	if !ok {
		return true
	}
	var alerts struct {
		WebhookEnabled *bool `json:"webhookEnabled"`
	}
	if json.Unmarshal(alertsRaw, &alerts) != nil {
		return true
	}
	if alerts.WebhookEnabled == nil {
		return true
	}
	return *alerts.WebhookEnabled
}
