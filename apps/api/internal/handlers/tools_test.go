package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHTTPCheckMissingURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/http-check", nil)

	h.HTTPCheck(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestHTTPCheckLocalServer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/http-check?url="+srv.URL, nil)

	h.HTTPCheck(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["isUp"] != true {
		t.Fatalf("isUp = %v", body["isUp"])
	}
}

func TestDNSLookupMissingHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/dns-lookup", nil)

	h.DNSLookup(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestDNSLookupExampleCom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/dns-lookup?host=example.com&type=A", nil)

	h.DNSLookup(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["host"] != "example.com" {
		t.Fatalf("host = %v", body["host"])
	}
	if body["recordType"] != "A" {
		t.Fatalf("recordType = %v", body["recordType"])
	}
}

func TestPingTestMissingHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/ping", nil)

	h.PingTest(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestPingTestLocalhost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/ping?host=127.0.0.1", nil)

	h.PingTest(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestPortCheckMissingHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/port-check", nil)

	h.PortCheck(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestPortCheckLocalListener(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/port-check?host=127.0.0.1&port="+portStr, nil)

	h.PortCheck(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["isUp"] != true {
		t.Fatalf("isUp = %v", body["isUp"])
	}
}

func TestHTTPHeadersMissingURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/http-headers", nil)

	h.HTTPHeaders(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestHTTPHeadersLocalServer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Test-Header", "pulsewatch")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/http-headers?url="+srv.URL, nil)

	h.HTTPHeaders(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	headers, ok := body["headers"].(map[string]interface{})
	if !ok {
		t.Fatalf("headers = %v", body["headers"])
	}
	if _, ok := headers["X-Test-Header"]; !ok {
		t.Fatalf("missing X-Test-Header in %v", headers)
	}
}

func TestRedirectCheckMissingURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/redirect-check", nil)

	h.RedirectCheck(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRedirectCheckChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	final := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer final.Close()

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, final.URL, http.StatusFound)
	}))
	defer redirect.Close()

	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/redirect-check?url="+redirect.URL, nil)

	h.RedirectCheck(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if int(body["hopCount"].(float64)) != 2 {
		t.Fatalf("hopCount = %v, want 2", body["hopCount"])
	}
	if body["finalUrl"] != final.URL {
		t.Fatalf("finalUrl = %v, want %s", body["finalUrl"], final.URL)
	}
}

func TestGenerateBadgeToken(t *testing.T) {
	token1 := generateBadgeToken()
	token2 := generateBadgeToken()
	if len(token1) != 24 {
		t.Fatalf("token1 length = %d, want 24", len(token1))
	}
	if token1 == token2 {
		t.Fatal("tokens should be unique")
	}
}

func TestRenderBadgeSVG(t *testing.T) {
	svg := renderBadgeSVG("uptime", "99.97%", "#4c1")
	if !strings.Contains(string(svg), "99.97%") {
		t.Fatalf("missing message in svg: %s", string(svg))
	}
	if !strings.Contains(string(svg), "uptime") {
		t.Fatalf("missing label in svg")
	}
}

func TestBadgeSVGMissingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/badge/.svg", nil)
	c.Params = []gin.Param{{Key: "token", Value: ""}}

	h.BadgeSVG(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	ct := w.Header().Get("Content-Type")
	if ct != "image/svg+xml" {
		t.Fatalf("content-type = %s, want image/svg+xml", ct)
	}
}

func TestBadgeSVGUnknownToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewToolsHandler(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/public/badge/unknown.svg", nil)
	c.Params = []gin.Param{{Key: "token", Value: "unknown"}}

	h.BadgeSVG(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "not found") {
		t.Fatalf("expected 'not found' in response, got: %s", body)
	}
}
