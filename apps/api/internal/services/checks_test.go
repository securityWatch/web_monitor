package services_test

import (
	"context"
	"encoding/json"
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
	assert.Greater(t, outcome.ResponseMs, 0)
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
