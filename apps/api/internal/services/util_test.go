package services_test

import (
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidatePassword(t *testing.T) {
	assert.NoError(t, services.ValidatePassword("password123"))
	assert.Error(t, services.ValidatePassword("short"))
	assert.Error(t, services.ValidatePassword("12345678"))
}

func TestValidateEmail(t *testing.T) {
	assert.True(t, services.ValidateEmail("user@example.com"))
	assert.False(t, services.ValidateEmail("invalid"))
}

func TestHashPassword(t *testing.T) {
	hash, err := services.HashPassword("testpass123")
	require.NoError(t, err)
	assert.True(t, services.CheckPassword(hash, "testpass123"))
	assert.False(t, services.CheckPassword(hash, "wrong"))
}

func TestNormalizeURL(t *testing.T) {
	url, err := services.NormalizeURL("example.com")
	require.NoError(t, err)
	assert.Equal(t, "https://example.com", url)

	url, err = services.NormalizeURL("https://api.test.com/health")
	require.NoError(t, err)
	assert.Equal(t, "https://api.test.com/health", url)
}

func TestSlugify(t *testing.T) {
	assert.Equal(t, "my-workspace", services.Slugify("My Workspace!"))
}

func TestPlanLimits(t *testing.T) {
	assert.Equal(t, 300, services.PlanMinInterval("free"))
	assert.Equal(t, 60, services.PlanMinInterval("pro"))
	assert.Equal(t, 10, services.PlanMonitorQuota("free"))
	assert.Equal(t, 50, services.PlanMonitorQuota("pro"))
}

func TestPlanMinIntervalForTamperAI(t *testing.T) {
	aiConfig := []byte(`{"aiContentRecognitionEnabled":true}`)
	assert.Equal(t, 1800, services.PlanMinIntervalForMonitor("free", "tamper", aiConfig))
	assert.Equal(t, 30, services.PlanMinIntervalForMonitor("pro", "tamper", aiConfig))
	assert.Equal(t, 30, services.PlanMinIntervalForMonitor("team", "tamper", aiConfig))
	assert.Equal(t, 300, services.PlanMinIntervalForMonitor("free", "tamper", []byte(`{}`)))
	assert.Equal(t, 60, services.PlanMinIntervalForMonitor("pro", "http", aiConfig))
}
