package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeAlertEventTypes(t *testing.T) {
	assert.Equal(t, []string{"all"}, NormalizeAlertEventTypes(nil, ""))
	assert.Equal(t, []string{"all"}, NormalizeAlertEventTypes([]string{"all", "down"}, ""))
	assert.Equal(t, []string{"down", "up"}, NormalizeAlertEventTypes([]string{"down", "up", "down"}, ""))
	assert.Equal(t, []string{"ssl_warning"}, NormalizeAlertEventTypes(nil, "ssl_warning"))
	assert.Equal(t, []string{"all"}, NormalizeAlertEventTypes([]string{"bogus"}, "all"))
}

func TestAlertEventMatchesRule(t *testing.T) {
	assert.True(t, AlertEventMatchesRule("all", "down"))
	assert.True(t, AlertEventMatchesRule("down", "down"))
	assert.False(t, AlertEventMatchesRule("down", "up"))
	assert.True(t, AlertEventMatchesRule("up", "recovery"))
	assert.True(t, AlertEventMatchesRule("security", "tamper_ai_content_violation"))
	assert.True(t, AlertEventMatchesRule("ssl_warning", "ssl_warning"))
}
