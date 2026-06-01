package handlers

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/services"
)

type ToolsHandler struct {
	db *pgxpool.Pool
}

func NewToolsHandler(db *pgxpool.Pool) *ToolsHandler {
	return &ToolsHandler{db: db}
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

func normalizeToolURL(raw string) string {
	target := strings.TrimSpace(raw)
	if target == "" {
		return ""
	}
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = "https://" + target
	}
	return target
}

func (h *ToolsHandler) RedirectCheck(c *gin.Context) {
	target := normalizeToolURL(c.Query("url"))
	if target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	const maxHops = 10
	hops := make([]gin.H, 0, maxHops)
	current := target
	totalMs := 0
	finalURL := target
	var chainErr string

	for i := 0; i < maxHops; i++ {
		start := time.Now()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, current, nil)
		if err != nil {
			chainErr = err.Error()
			break
		}
		req.Header.Set("User-Agent", "PulseWatch-RedirectCheck/1.0")

		resp, err := client.Do(req)
		ms := int(time.Since(start).Milliseconds())
		totalMs += ms

		if err != nil {
			hops = append(hops, gin.H{"url": current, "responseMs": ms, "error": err.Error()})
			chainErr = err.Error()
			break
		}

		hop := gin.H{
			"url":        current,
			"statusCode": resp.StatusCode,
			"responseMs": ms,
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		resp.Body.Close()

		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			loc := strings.TrimSpace(resp.Header.Get("Location"))
			if loc != "" {
				hop["location"] = loc
			}
			hops = append(hops, hop)

			if loc == "" {
				finalURL = current
				break
			}
			base, parseErr := url.Parse(current)
			if parseErr != nil {
				chainErr = parseErr.Error()
				break
			}
			rel, parseErr := url.Parse(loc)
			if parseErr != nil {
				chainErr = parseErr.Error()
				break
			}
			next := base.ResolveReference(rel).String()
			if next == current {
				chainErr = "redirect loop"
				break
			}
			current = next
			finalURL = current
			continue
		}

		hops = append(hops, hop)
		finalURL = current
		break
	}

	if len(hops) >= maxHops {
		chainErr = "too many redirects"
	}

	resp := gin.H{
		"startUrl":        target,
		"finalUrl":        finalURL,
		"hops":            hops,
		"hopCount":        len(hops),
		"totalResponseMs": totalMs,
	}
	if chainErr != "" {
		resp["error"] = chainErr
	}
	c.JSON(http.StatusOK, resp)
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

func generateBadgeToken() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func renderBadgeSVG(label, message, color string) []byte {
	label = strings.ReplaceAll(label, "&", "&amp;")
	label = strings.ReplaceAll(label, "<", "&lt;")
	label = strings.ReplaceAll(label, ">", "&gt;")
	message = strings.ReplaceAll(message, "&", "&amp;")
	message = strings.ReplaceAll(message, "<", "&lt;")
	message = strings.ReplaceAll(message, ">", "&gt;")

	labelWidth := len(label)*7 + 12
	if labelWidth < 40 {
		labelWidth = 40
	}
	msgWidth := len(message)*7 + 12
	if msgWidth < 30 {
		msgWidth = 30
	}
	totalWidth := labelWidth + msgWidth
	msgStart := labelWidth

	return []byte(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="20">
  <linearGradient id="s" x2="0" y2="100%%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="%d" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="%d" height="20" fill="#555"/>
    <rect x="%d" width="%d" height="20" fill="%s"/>
    <rect width="%d" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="%d" y="14">%s</text>
    <text x="%d" y="14">%s</text>
  </g>
</svg>`,
		totalWidth, totalWidth, labelWidth, msgStart, msgWidth, color, totalWidth,
		labelWidth/2+1, label,
		msgStart+msgWidth/2+1, message))
}

func (h *ToolsHandler) BadgeSVG(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.Data(http.StatusBadRequest, "image/svg+xml", renderBadgeSVG("pulsewatch", "invalid", "#e05d44"))
		return
	}

	var id, status, name string
	var uptime sql.NullFloat64
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT m.id, m.status, m.name,
			ROUND(
				COALESCE(
					(SELECT 100.0 * COUNT(*) FILTER (WHERE is_up) / NULLIF(COUNT(*), 0)
					 FROM check_results cr
					 WHERE cr.monitor_id = m.id
					   AND cr.checked_at > now() - interval '24 hours'),
				100.0
				), 2
			) AS uptime_24h
		FROM monitors m
		WHERE m.public_badge_token = $1 AND m.status != 'paused'
	`, token).Scan(&id, &status, &name, &uptime)
	if err != nil {
		c.Data(http.StatusOK, "image/svg+xml", renderBadgeSVG("pulsewatch", "not found", "#e05d44"))
		return
	}

	var label, message, color string
	if status == "up" {
		label = name
		if uptime.Valid {
			message = fmt.Sprintf("%.2f%% uptime", uptime.Float64)
		} else {
			message = "up"
		}
		color = "#4c1"
	} else if status == "down" {
		label = name
		message = "down"
		color = "#e05d44"
	} else {
		label = name
		message = "pending"
		color = "#dfb317"
	}

	svg := renderBadgeSVG(label, message, color)
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Data(http.StatusOK, "image/svg+xml", svg)
}

