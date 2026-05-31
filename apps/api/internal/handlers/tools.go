package handlers

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/services"
)

type ToolsHandler struct{}

func NewToolsHandler() *ToolsHandler {
	return &ToolsHandler{}
}

func (h *ToolsHandler) SSLCheck(c *gin.Context) {
	host := strings.TrimSpace(c.Query("host"))
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host is required"})
		return
	}
	host = strings.TrimPrefix(strings.TrimPrefix(host, "https://"), "http://")
	host = strings.Split(host, "/")[0]

	addr := host
	if !strings.Contains(addr, ":") {
		addr += ":443"
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"host": host, "valid": false, "error": err.Error()})
		return
	}
	defer conn.Close()
	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		c.JSON(http.StatusOK, gin.H{"host": host, "valid": false, "error": "no certificate"})
		return
	}
	cert := state.PeerCertificates[0]
	daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
	c.JSON(http.StatusOK, gin.H{
		"host":       host,
		"valid":      time.Now().Before(cert.NotAfter),
		"issuer":     cert.Issuer.CommonName,
		"subject":    cert.Subject.CommonName,
		"expiresAt":  cert.NotAfter.Format(time.RFC3339),
		"daysLeft":   daysLeft,
		"tlsVersion": tlsVersionName(state.Version),
	})
}

var allowedDNSRecordTypes = map[string]bool{
	"A": true, "AAAA": true, "CNAME": true, "MX": true, "TXT": true, "NS": true,
}

func normalizeToolHost(raw string) string {
	host := strings.TrimSpace(raw)
	host = strings.TrimPrefix(strings.TrimPrefix(host, "https://"), "http://")
	host = strings.Split(host, "/")[0]
	return strings.Split(host, ":")[0]
}

func recordsFromMeta(meta map[string]interface{}) []string {
	if meta == nil {
		return []string{}
	}
	raw, ok := meta["records"]
	if !ok {
		return []string{}
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return []string{}
	}
}

func checkOutcomeJSON(outcome services.CheckOutcome, extra gin.H) gin.H {
	resp := gin.H{
		"isUp":       outcome.IsUp,
		"responseMs": outcome.ResponseMs,
	}
	for k, v := range extra {
		resp[k] = v
	}
	if outcome.ErrorMessage != "" {
		resp["error"] = outcome.ErrorMessage
	}
	if outcome.Metadata != nil {
		resp["metadata"] = outcome.Metadata
	}
	return resp
}

func (h *ToolsHandler) DNSLookup(c *gin.Context) {
	host := normalizeToolHost(c.Query("host"))
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host is required"})
		return
	}

	recordType := strings.ToUpper(strings.TrimSpace(c.Query("type")))
	if recordType == "" {
		recordType = "A"
	}
	if !allowedDNSRecordTypes[recordType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be one of A, AAAA, CNAME, MX, TXT, NS"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	cfg, _ := json.Marshal(map[string]string{"recordType": recordType})
	outcome := services.RunCheck(ctx, "dns", host, cfg)
	records := recordsFromMeta(outcome.Metadata)

	c.JSON(http.StatusOK, checkOutcomeJSON(outcome, gin.H{
		"host":       host,
		"recordType": recordType,
		"records":    records,
	}))
}

func (h *ToolsHandler) PingTest(c *gin.Context) {
	host := normalizeToolHost(c.Query("host"))
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	outcome := services.RunCheck(ctx, "ping", host, json.RawMessage(`{}`))
	c.JSON(http.StatusOK, checkOutcomeJSON(outcome, gin.H{"host": host}))
}

func (h *ToolsHandler) PortCheck(c *gin.Context) {
	host := normalizeToolHost(c.Query("host"))
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host is required"})
		return
	}

	port := strings.TrimSpace(c.Query("port"))
	if port == "" {
		port = "443"
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	target := net.JoinHostPort(host, port)
	outcome := services.RunCheck(ctx, "tcp", target, json.RawMessage(`{}`))
	c.JSON(http.StatusOK, checkOutcomeJSON(outcome, gin.H{
		"host": host,
		"port": port,
	}))
}

func (h *ToolsHandler) HTTPCheck(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}
	target := rawURL
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = "https://" + target
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	outcome := services.RunCheck(ctx, "http", target, json.RawMessage(`{"timeout":15}`))
	resp := gin.H{
		"url":        target,
		"isUp":       outcome.IsUp,
		"responseMs": outcome.ResponseMs,
	}
	if outcome.StatusCode != nil {
		resp["statusCode"] = *outcome.StatusCode
	}
	if outcome.ErrorMessage != "" {
		resp["error"] = outcome.ErrorMessage
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ToolsHandler) HTTPHeaders(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}
	target := rawURL
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = "https://" + target
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	start := time.Now()
	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	doRequest := func(method string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, method, target, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "PulseWatch-HTTPHeaders/1.0")
		return client.Do(req)
	}

	resp, err := doRequest(http.MethodHead)
	if err != nil || (resp != nil && resp.StatusCode == http.StatusMethodNotAllowed) {
		if resp != nil {
			resp.Body.Close()
		}
		resp, err = doRequest(http.MethodGet)
	}
	elapsed := int(time.Since(start).Milliseconds())

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"url":        target,
			"isUp":       false,
			"responseMs": elapsed,
			"headers":    gin.H{},
			"error":      err.Error(),
		})
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	headers := make(map[string][]string)
	for k, vals := range resp.Header {
		if len(k) > 128 {
			continue
		}
		trimmed := make([]string, 0, len(vals))
		for _, v := range vals {
			if len(v) > 512 {
				v = v[:512] + "…"
			}
			trimmed = append(trimmed, v)
		}
		headers[k] = trimmed
	}

	c.JSON(http.StatusOK, gin.H{
		"url":        target,
		"isUp":       resp.StatusCode > 0 && resp.StatusCode < 500,
		"statusCode": resp.StatusCode,
		"responseMs": elapsed,
		"headers":    headers,
	})
}

func tlsVersionName(v uint16) string {
	switch v {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("0x%x", v)
	}
}
