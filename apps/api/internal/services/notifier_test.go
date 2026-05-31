package services

import (
	"strings"
	"testing"

	"github.com/pulsewatch/api/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestNotifierConfigured(t *testing.T) {
	n := NewNotifier(&config.Config{})
	assert.False(t, n.Configured())

	n2 := NewNotifier(&config.Config{DingTalkWebhookURL: "https://oapi.dingtalk.com/robot/send?access_token=x"})
	assert.True(t, n2.Configured())
}

func TestNotifierMessagesContainTestKeyword(t *testing.T) {
	userMsg := formatUserRegisteredMessage("a@b.com", "Alice", "uid-1", "email")
	assert.True(t, strings.HasPrefix(userMsg, "测试\n【新用户注册】"))
	assert.Contains(t, userMsg, "Alice")
	assert.Contains(t, userMsg, "a@b.com")

	monitorMsg := formatMonitorCreatedMessage("Homepage", "http", "https://example.com", "a@b.com", "Alice", "mid-1")
	assert.True(t, strings.HasPrefix(monitorMsg, "测试\n【新建监控】"))
	assert.Contains(t, monitorMsg, "Homepage")
	assert.Contains(t, monitorMsg, "https://example.com")
}
