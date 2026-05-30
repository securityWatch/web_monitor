package services_test

import (
	"encoding/json"
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
)

func TestMonitorWebhookAlertsEnabled(t *testing.T) {
	assert.True(t, services.MonitorWebhookAlertsEnabled(nil))
	assert.True(t, services.MonitorWebhookAlertsEnabled(json.RawMessage(`{}`)))
	assert.True(t, services.MonitorWebhookAlertsEnabled(json.RawMessage(`{"alerts":{}}`)))
	assert.True(t, services.MonitorWebhookAlertsEnabled(json.RawMessage(`{"alerts":{"webhookEnabled":true}}`)))

	disabled := json.RawMessage(`{"alerts":{"webhookEnabled":false}}`)
	assert.False(t, services.MonitorWebhookAlertsEnabled(disabled))

	withHTTP := json.RawMessage(`{"method":"GET","alerts":{"webhookEnabled":false}}`)
	assert.False(t, services.MonitorWebhookAlertsEnabled(withHTTP))
}
