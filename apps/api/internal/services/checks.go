package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
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
		httpCfg := ParseHTTPConfig(cfg)
		return executeHTTPMonitor(ctx, targetURL, httpCfg, monitorType, start)
	case "pagespeed":
		httpCfg := ParseHTTPConfig(cfg)
		out := executeHTTPMonitor(ctx, targetURL, httpCfg, "http", start)
		return evaluatePageSpeed(out, cfg, start)
	case "tcp":
		return runTCPCheck(ctx, targetURL, start)
	case "ping":
		return runPingCheck(ctx, targetURL, start)
	case "dns":
		return runDNSCheck(ctx, targetURL, config, start)
	case "domain":
		return runDomainCheck(ctx, targetURL, config, start)
	default:
		return CheckOutcome{IsUp: false, ResponseMs: int(time.Since(start).Milliseconds()), ErrorMessage: "unknown monitor type"}
	}
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

func runDNSCheck(ctx context.Context, target string, config json.RawMessage, start time.Time) CheckOutcome {
	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)
	recordType := "A"
	if v, ok := cfg["recordType"].(string); ok && v != "" {
		recordType = strings.ToUpper(v)
	}
	host := strings.TrimPrefix(strings.TrimPrefix(target, "dns://"), "http://")
	host = strings.Split(host, "/")[0]
	host = strings.Split(host, ":")[0]

	var addrs []string
	var err error
	switch recordType {
	case "AAAA":
		addrs, err = net.DefaultResolver.LookupHost(ctx, host)
	case "CNAME":
		cname, e := net.DefaultResolver.LookupCNAME(ctx, host)
		if e != nil {
			err = e
		} else if cname == "" {
			err = fmt.Errorf("no CNAME record")
		} else {
			addrs = []string{cname}
		}
	case "MX":
		mxs, e := net.DefaultResolver.LookupMX(ctx, host)
		if e != nil {
			err = e
		} else if len(mxs) == 0 {
			err = fmt.Errorf("no MX records")
		} else {
			for _, mx := range mxs {
				addrs = append(addrs, mx.Host)
			}
		}
	default:
		addrs, err = net.DefaultResolver.LookupHost(ctx, host)
	}
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil || len(addrs) == 0 {
		msg := "DNS lookup failed"
		if err != nil {
			msg = err.Error()
		}
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: msg}
	}
	expected := ""
	if v, ok := cfg["expectedValue"].(string); ok {
		expected = v
	}
	if expected != "" {
		found := false
		for _, a := range addrs {
			if strings.Contains(a, expected) {
				found = true
				break
			}
		}
		if !found {
			return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: fmt.Sprintf("expected %q not in records", expected), Metadata: map[string]interface{}{"records": addrs}}
		}
	}
	return CheckOutcome{IsUp: true, ResponseMs: elapsed, Metadata: map[string]interface{}{"records": addrs, "recordType": recordType}}
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

func evaluatePageSpeed(out CheckOutcome, cfg map[string]interface{}, start time.Time) CheckOutcome {
	if !out.IsUp {
		return out
	}
	maxTTFB := 2000
	if v, ok := cfg["maxTtfbMs"].(float64); ok && v > 0 {
		maxTTFB = int(v)
	}
	ttfb := 0
	if v, ok := out.Metadata["ttfbMs"].(int); ok {
		ttfb = v
	} else if v, ok := out.Metadata["ttfbMs"].(float64); ok {
		ttfb = int(v)
	}
	out.Metadata["pageSpeed"] = true
	// Estimate Core Web Vitals from TTFB + response timing (MVP without headless browser)
	bodyMs := out.ResponseMs - ttfb
	if bodyMs < 0 {
		bodyMs = 0
	}
	fcpMs := ttfb + 80
	lcpMs := ttfb + bodyMs/2
	if lcpMs < fcpMs {
		lcpMs = fcpMs + 120
	}
	out.Metadata["fcpMs"] = fcpMs
	out.Metadata["lcpMs"] = lcpMs

	maxLCP := 2500
	if v, ok := cfg["maxLcpMs"].(float64); ok && v > 0 {
		maxLCP = int(v)
	}
	if lcpMs > maxLCP {
		out.IsUp = false
		out.ErrorMessage = fmt.Sprintf("LCP %dms exceeds threshold %dms", lcpMs, maxLCP)
		return out
	}
	if ttfb > maxTTFB {
		out.IsUp = false
		out.ErrorMessage = fmt.Sprintf("TTFB %dms exceeds threshold %dms", ttfb, maxTTFB)
	}
	return out
}
