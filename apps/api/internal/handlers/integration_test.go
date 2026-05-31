package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/database"
	"github.com/pulsewatch/api/internal/router"
	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testRouter *gin.Engine
var testDB *pgxpool.Pool

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := database.Connect(ctx, dbURL)
	if err != nil {
		fmt.Printf("SKIP integration tests: database unavailable: %v\n", err)
		os.Exit(0)
	}
	testDB = pool
	cfg := config.Load()
	cfg.DatabaseURL = dbURL
	cfg.JWTSecret = "test-secret"
	cfg.JWTRefreshSecret = "test-refresh-secret"
	testRouter = router.Setup(cfg, pool)
	os.Exit(m.Run())
}

func uniqueEmail(prefix string) string {
	return fmt.Sprintf("%s-%d@test.pulsewatch.io", prefix, time.Now().UnixNano())
}

func seedOTP(t *testing.T, email, purpose, code string) {
	t.Helper()
	ctx := context.Background()
	_, err := testDB.Exec(ctx, `
		INSERT INTO email_otp_codes (id, email, purpose, code_hash, expires_at)
		VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
	`, uuid.New().String(), strings.ToLower(email), purpose, services.HashToken(code))
	require.NoError(t, err)
}

func registerUser(t *testing.T, email, password string) map[string]interface{} {
	t.Helper()
	seedOTP(t, email, services.OTPPurposeRegister, "123456")
	body, _ := json.Marshal(map[string]string{
		"email": email, "password": password, "displayName": "Test User", "code": "123456",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	return resp
}

func TestHealth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRegisterLoginRefresh(t *testing.T) {
	email := uniqueEmail("auth")
	resp := registerUser(t, email, "password123")
	token := resp["accessToken"].(string)
	require.NotEmpty(t, token)

	loginBody, _ := json.Marshal(map[string]string{"email": email, "password": "password123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var loginResp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &loginResp))
	refresh := loginResp["refreshToken"].(string)

	refBody, _ := json.Marshal(map[string]string{"refreshToken": refresh})
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", bytes.NewReader(refBody))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	testRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}

func TestMonitorCRUD(t *testing.T) {
	resp := registerUser(t, uniqueEmail("monitor"), "password123")
	token := resp["accessToken"].(string)
	org := resp["organization"].(map[string]interface{})
	orgID := org["id"].(string)

	createBody, _ := json.Marshal(map[string]interface{}{
		"name": "Test Site", "type": "http", "targetUrl": "https://example.com", "intervalSeconds": 300,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/orgs/"+orgID+"/monitors", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var monitor map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &monitor))
	id := monitor["id"].(string)

	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/orgs/"+orgID+"/monitors", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	testRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)

	patchBody, _ := json.Marshal(map[string]string{"name": "Updated Site"})
	req3 := httptest.NewRequest(http.MethodPatch, "/api/v1/orgs/"+orgID+"/monitors/"+id, bytes.NewReader(patchBody))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set("Authorization", "Bearer "+token)
	w3 := httptest.NewRecorder()
	testRouter.ServeHTTP(w3, req3)
	assert.Equal(t, http.StatusOK, w3.Code)

	req4 := httptest.NewRequest(http.MethodDelete, "/api/v1/orgs/"+orgID+"/monitors/"+id, nil)
	req4.Header.Set("Authorization", "Bearer "+token)
	w4 := httptest.NewRecorder()
	testRouter.ServeHTTP(w4, req4)
	assert.Equal(t, http.StatusOK, w4.Code)
}

func TestMonitorStats(t *testing.T) {
	resp := registerUser(t, uniqueEmail("stats"), "password123")
	token := resp["accessToken"].(string)
	orgID := resp["organization"].(map[string]interface{})["id"].(string)

	createBody, _ := json.Marshal(map[string]interface{}{
		"name": "Stats Site", "type": "http", "targetUrl": "https://example.com", "intervalSeconds": 300,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/orgs/"+orgID+"/monitors", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var monitor map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &monitor))
	id := monitor["id"].(string)

	ctx := context.Background()
	_, err := testDB.Exec(ctx, `
		INSERT INTO check_results (id, org_id, monitor_id, checked_at, region, status_code, response_ms, is_up, metadata)
		VALUES ($1, $2, $3, now(), 'us-east', 200, 120, true, '{}')
	`, uuid.New().String(), orgID, id)
	require.NoError(t, err)

	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/orgs/"+orgID+"/monitors/"+id+"/stats", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	testRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code, w2.Body.String())

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &body))
	trend, ok := body["trend"].([]interface{})
	require.True(t, ok)
	assert.NotEmpty(t, trend)
}

func TestPasswordChange(t *testing.T) {
	email := uniqueEmail("pwd")
	resp := registerUser(t, email, "password123")
	token := resp["accessToken"].(string)

	body, _ := json.Marshal(map[string]string{"currentPassword": "password123", "newPassword": "newpassword456"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/me/password/change", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDashboard(t *testing.T) {
	resp := registerUser(t, uniqueEmail("dash"), "password123")
	token := resp["accessToken"].(string)
	orgID := resp["organization"].(map[string]interface{})["id"].(string)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/orgs/"+orgID+"/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	testRouter.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRateLimitDoesNotCrash(t *testing.T) {
	for i := 0; i < 150; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		testRouter.ServeHTTP(w, req)
		assert.True(t, w.Code == http.StatusOK || w.Code == http.StatusTooManyRequests)
	}
}
