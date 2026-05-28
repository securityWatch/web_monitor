package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

type CheckOutcome struct {
	IsUp         bool
	StatusCode   *int
	ResponseMs   int
	ErrorMessage string
	Metadata     map[string]interface{}
}

func RunCheck(ctx context.Context, monitorType, targetURL string, config json.RawMessage) CheckOutcome {
	start := time.Now()
	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)

	switch monitorType {
	case "http", "keyword", "ssl":
		return runHTTPCheck(ctx, targetURL, cfg, monitorType, start)
	case "tcp":
		return runTCPCheck(ctx, targetURL, start)
	case "ping":
		return runPingCheck(ctx, targetURL, start)
	default:
		return CheckOutcome{IsUp: false, ResponseMs: int(time.Since(start).Milliseconds()), ErrorMessage: "unknown monitor type"}
	}
}

func runHTTPCheck(ctx context.Context, targetURL string, cfg map[string]interface{}, monitorType string, start time.Time) CheckOutcome {
	method := "GET"
	if m, ok := cfg["method"].(string); ok && m != "" {
		method = strings.ToUpper(m)
	}
	timeout := 30 * time.Second
	if t, ok := cfg["timeout"].(float64); ok && t > 0 {
		timeout = time.Duration(t) * time.Second
	}

	expectedStatus := 200
	if s, ok := cfg["expectedStatus"].(float64); ok {
		expectedStatus = int(s)
	}

	keyword := ""
	if k, ok := cfg["keyword"].(string); ok {
		keyword = k
	}
	keywordMustContain := true
	if v, ok := cfg["keywordMustContain"].(bool); ok {
		keywordMustContain = v
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, targetURL, nil)
	if err != nil {
		return failOutcome(start, err.Error())
	}

	client := &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
		},
	}

	resp, err := client.Do(req)
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil {
		return failOutcome(start, err.Error())
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	code := resp.StatusCode
	metadata := map[string]interface{}{}

	if monitorType == "ssl" {
		if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
			cert := resp.TLS.PeerCertificates[0]
			daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
			metadata["sslDaysLeft"] = daysLeft
			metadata["sslExpiresAt"] = cert.NotAfter.Format(time.RFC3339)
			if daysLeft < 30 {
				metadata["sslWarning"] = true
			}
		}
	}

	checkKeyword := monitorType == "keyword" || keyword != ""
	if checkKeyword && keyword != "" {
		found := strings.Contains(string(body), keyword)
		if keywordMustContain && !found {
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "keyword not found", Metadata: metadata}
		}
		if !keywordMustContain && found {
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "keyword found (should not contain)", Metadata: metadata}
		}
	}

	isUp := code == expectedStatus
	errMsg := ""
	if !isUp {
		errMsg = fmt.Sprintf("expected status %d, got %d", expectedStatus, code)
	}

	return CheckOutcome{IsUp: isUp, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: errMsg, Metadata: metadata}
}

func runTCPCheck(ctx context.Context, target string, start time.Time) CheckOutcome {
	host, port, err := parseHostPort(target, "80")
	if err != nil {
		return failOutcome(start, err.Error())
	}
	d := net.Dialer{Timeout: 10 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: err.Error()}
	}
	conn.Close()
	return CheckOutcome{IsUp: true, ResponseMs: elapsed}
}

func runPingCheck(ctx context.Context, target string, start time.Time) CheckOutcome {
	host := strings.TrimPrefix(strings.TrimPrefix(target, "https://"), "http://")
	host = strings.Split(host, "/")[0]
	host = strings.Split(host, ":")[0]

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "ping", "-n", "1", "-w", "5000", host)
	} else {
		cmd = exec.CommandContext(ctx, "ping", "-c", "1", "-W", "5", host)
	}
	output, err := cmd.CombinedOutput()
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: string(output)}
	}
	return CheckOutcome{IsUp: true, ResponseMs: elapsed}
}

func parseHostPort(target, defaultPort string) (string, string, error) {
	target = strings.TrimPrefix(strings.TrimPrefix(target, "tcp://"), "http://")
	if strings.Contains(target, ":") {
		host, port, err := net.SplitHostPort(target)
		if err == nil {
			return host, port, nil
		}
	}
	parts := strings.Split(target, ":")
	if len(parts) == 2 {
		return parts[0], parts[1], nil
	}
	return target, defaultPort, nil
}

func failOutcome(start time.Time, msg string) CheckOutcome {
	return CheckOutcome{IsUp: false, ResponseMs: int(time.Since(start).Milliseconds()), ErrorMessage: msg}
}

func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("URL is required")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") &&
		!strings.HasPrefix(raw, "tcp://") && !regexp.MustCompile(`^[\w.-]+:\d+$`).MatchString(raw) {
		raw = "https://" + raw
	}
	return raw, nil
}
