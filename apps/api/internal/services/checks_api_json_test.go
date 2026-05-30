package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunAPIJSONCheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	cfg := `{"jsonAssertions":[{"path":"status","operator":"eq","value":"ok"}]}`
	outcome := services.RunCheck(context.Background(), "api_json", srv.URL, []byte(cfg))
	assert.True(t, outcome.IsUp)

	cfgBad := `{"jsonAssertions":[{"path":"status","operator":"eq","value":"down"}]}`
	outcome2 := services.RunCheck(context.Background(), "api_json", srv.URL, []byte(cfgBad))
	assert.False(t, outcome2.IsUp)
}

func TestRunAPIJSONRequiresAssertion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"a":1}`))
	}))
	defer srv.Close()
	outcome := services.RunCheck(context.Background(), "api_json", srv.URL, []byte(`{}`))
	assert.False(t, outcome.IsUp)
	require.Contains(t, outcome.ErrorMessage, "JSON assertion")
}
