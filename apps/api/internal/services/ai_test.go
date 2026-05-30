package services_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildMonitorDraftWithAI(t *testing.T) {
	deepSeek := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"{\"name\":\"Login API\",\"type\":\"http\",\"targetUrl\":\"https://api.example.com/login\",\"intervalSeconds\":60,\"config\":{\"method\":\"POST\",\"expectedStatuses\":[200,401]},\"regions\":[\"us-east\"],\"explanation\":\"Checks login endpoint\"}"}}]}`))
	}))
	defer deepSeek.Close()
	t.Setenv("DEEPSEEK_API_KEY", "test-key")
	t.Setenv("DEEPSEEK_API_BASE_URL", deepSeek.URL)

	draft, err := services.BuildMonitorDraftWithAI(context.Background(), "monitor login api")
	require.NoError(t, err)
	assert.Equal(t, "Login API", draft.Name)
	assert.Equal(t, "http", draft.Type)
	assert.Equal(t, 60, draft.IntervalSeconds)
	assert.Equal(t, "POST", draft.Config["method"])
}

func TestExplainAlertWithAI(t *testing.T) {
	deepSeek := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"{\"summary\":\"Endpoint returned 500\",\"likelyCause\":\"Application error\",\"nextSteps\":[\"Check app logs\",\"Inspect recent deploy\"],\"severity\":\"high\"}"}}]}`))
	}))
	defer deepSeek.Close()
	t.Setenv("DEEPSEEK_API_KEY", "test-key")
	t.Setenv("DEEPSEEK_API_BASE_URL", deepSeek.URL)

	out, err := services.ExplainAlertWithAI(context.Background(), "api", "down", "HTTP 500")
	require.NoError(t, err)
	assert.Equal(t, "Endpoint returned 500", out.Summary)
	assert.Len(t, out.NextSteps, 2)
}
