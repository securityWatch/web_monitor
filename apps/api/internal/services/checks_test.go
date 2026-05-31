package services_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunHTTPCheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("hello world"))
	}))
	defer srv.Close()

	outcome := services.RunCheck(context.Background(), "http", srv.URL, json.RawMessage(`{}`))
	assert.True(t, outcome.IsUp)
	require.NotNil(t, outcome.StatusCode)
	assert.Equal(t, 200, *outcome.StatusCode)
	assert.GreaterOrEqual(t, outcome.ResponseMs, 0)
}

func TestRunHTTPCheckDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	outcome := services.RunCheck(context.Background(), "http", srv.URL, json.RawMessage(`{"expectedStatus":200}`))
	assert.False(t, outcome.IsUp)
}

func TestRunKeywordCheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("PulseWatch OK"))
	}))
	defer srv.Close()

	cfg := json.RawMessage(`{"keyword":"PulseWatch","keywordMustContain":true}`)
	outcome := services.RunCheck(context.Background(), "keyword", srv.URL, cfg)
	assert.True(t, outcome.IsUp)

	cfg2 := json.RawMessage(`{"keyword":"missing","keywordMustContain":true}`)
	outcome2 := services.RunCheck(context.Background(), "keyword", srv.URL, cfg2)
	assert.False(t, outcome2.IsUp)
}

func TestRunTCPCheck(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()
	go func() {
		conn, _ := ln.Accept()
		if conn != nil {
			conn.Close()
		}
	}()
	outcome := services.RunCheck(context.Background(), "tcp", ln.Addr().String(), json.RawMessage(`{}`))
	assert.True(t, outcome.IsUp)
}

func TestRunHTTPPostBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		body, _ := io.ReadAll(r.Body)
		assert.JSONEq(t, `{"ping":true}`, string(body))
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	cfg := json.RawMessage(`{"method":"POST","body":"{\"ping\":true}","expectedStatus":201}`)
	outcome := services.RunCheck(context.Background(), "http", srv.URL, cfg)
	assert.True(t, outcome.IsUp)
	require.NotNil(t, outcome.StatusCode)
	assert.Equal(t, 201, *outcome.StatusCode)
}

func TestRunHTTPRequestChain(t *testing.T) {
	var token string
	login := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"accessToken":"secret-token-123"}`))
	}))
	defer login.Close()

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token = r.URL.Query().Get("token")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer api.Close()

	cfg := json.RawMessage(fmt.Sprintf(`{
		"steps": [
			{"url":%q,"method":"GET","extract":[{"var":"token","from":"json","path":"accessToken"}]},
			{"url":%q,"method":"GET","extract":[]}
		]
	}`, login.URL, api.URL+"?token={{token}}"))

	outcome := services.RunCheck(context.Background(), "http", login.URL, cfg)
	assert.True(t, outcome.IsUp, outcome.ErrorMessage)
	assert.Equal(t, "secret-token-123", token)
}

func TestHTTPTimingsMetadata(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	outcome := services.RunCheck(context.Background(), "http", srv.URL, json.RawMessage(`{}`))
	assert.True(t, outcome.IsUp)
	timings, ok := outcome.Metadata["timings"].(map[string]interface{})
	require.True(t, ok, "expected timings in metadata")
	assert.NotNil(t, timings["totalMs"])
}

func TestRunPageSpeedCheckMetadataAndBudgets(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`<!doctype html><html><head><link rel="stylesheet" href="/app.css"><script src="/app.js"></script></head><body><img src="/hero.png"></body></html>`))
	}))
	defer srv.Close()

	outcome := services.RunCheck(context.Background(), "pagespeed", srv.URL, json.RawMessage(`{"maxTtfbMs":2000,"maxLcpMs":2500,"maxTotalMs":5000,"maxPageWeightKb":2048}`))
	assert.True(t, outcome.IsUp, outcome.ErrorMessage)
	assert.Equal(t, true, outcome.Metadata["pageSpeed"])
	assert.NotNil(t, outcome.Metadata["fcpMs"])
	assert.NotNil(t, outcome.Metadata["lcpMs"])
	assert.NotNil(t, outcome.Metadata["performanceScore"])
	assert.Equal(t, "pass", outcome.Metadata["budgetStatus"])
	inventory, ok := outcome.Metadata["resourceInventory"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, 3, inventory["total"])

	failing := services.RunCheck(context.Background(), "pagespeed", srv.URL, json.RawMessage(`{"maxLcpMs":1}`))
	assert.False(t, failing.IsUp)
	assert.Equal(t, "fail", failing.Metadata["budgetStatus"])
}

func TestRunHTTPMultipleExpectedStatuses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	cfg := json.RawMessage(`{"expectedStatuses":[200,201,204]}`)
	outcome := services.RunCheck(context.Background(), "http", srv.URL, cfg)
	assert.True(t, outcome.IsUp, outcome.ErrorMessage)

	cfg2 := json.RawMessage(`{"expectedStatuses":[200,404]}`)
	outcome2 := services.RunCheck(context.Background(), "http", srv.URL, cfg2)
	assert.False(t, outcome2.IsUp)
	assert.Contains(t, outcome2.ErrorMessage, "201")
}

func TestRunCheckTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	cfg := json.RawMessage(`{"timeout":1}`)
	outcome := services.RunCheck(context.Background(), "http", srv.URL, cfg)
	assert.False(t, outcome.IsUp)
}
