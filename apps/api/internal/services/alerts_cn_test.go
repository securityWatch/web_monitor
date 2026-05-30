package services_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDingTalkSign(t *testing.T) {
	ts := int64(1710000000000)
	secret := "SECtest123"
	expectedMAC := hmac.New(sha256.New, []byte(secret))
	expectedMAC.Write([]byte(fmt.Sprintf("%d\n%s", ts, secret)))
	expected := base64.StdEncoding.EncodeToString(expectedMAC.Sum(nil))

	assert.Equal(t, expected, services.DingTalkSign(ts, secret))
	assert.NotEmpty(t, services.DingTalkSign(ts, secret))
}

func TestFeishuSign(t *testing.T) {
	ts := int64(1710000000)
	secret := "test_secret"
	stringToSign := fmt.Sprintf("%d\n%s", ts, secret)
	expectedMAC := hmac.New(sha256.New, []byte(stringToSign))
	expected := base64.StdEncoding.EncodeToString(expectedMAC.Sum(nil))

	assert.Equal(t, expected, services.FeishuSign(ts, secret))
}

func TestDingTalkWebhookURLWithSign(t *testing.T) {
	base := "https://oapi.dingtalk.com/robot/send?access_token=abc"
	secret := "SECtest"

	got, err := services.BuildDingTalkWebhookURL(base, secret, true)
	require.NoError(t, err)

	parsed, err := url.Parse(got)
	require.NoError(t, err)
	q := parsed.Query()
	assert.Equal(t, "abc", q.Get("access_token"))
	assert.NotEmpty(t, q.Get("timestamp"))
	assert.NotEmpty(t, q.Get("sign"))
}

func TestDingTalkWebhookURLWithoutSign(t *testing.T) {
	base := "https://oapi.dingtalk.com/robot/send?access_token=abc"
	got, err := services.BuildDingTalkWebhookURL(base, "", false)
	require.NoError(t, err)
	assert.Equal(t, base, got)
}
