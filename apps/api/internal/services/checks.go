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
		out := executeHTTPMonitor(ctx, targetURL, httpCfg, "pagespeed", start)
		return evaluatePageSpeed(out, cfg, start)
	case "tcp":
		return runTCPCheck(ctx, targetURL, start)
	case "ping":
		return runPingCheck(ctx, targetURL, start)
	case "dns":
		return runDNSCheck(ctx, targetURL, config, start)
	case "tamper":
		return runTamperCheck(ctx, targetURL, config, start)
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
	if out.Metadata == nil {
		out.Metadata = map[string]interface{}{}
	}
	maxTTFB := 2000
	if v, ok := cfg["maxTtfbMs"].(float64); ok && v > 0 {
		maxTTFB = int(v)
	}
	maxTotal := 5000
	if v, ok := cfg["maxTotalMs"].(float64); ok && v > 0 {
		maxTotal = int(v)
	}
	maxWeightKB := 2048
	if v, ok := cfg["maxPageWeightKb"].(float64); ok && v > 0 {
		maxWeightKB = int(v)
	}
	ttfb := 0
	if v, ok := out.Metadata["ttfbMs"].(int); ok {
		ttfb = v
	} else if v, ok := out.Metadata["ttfbMs"].(float64); ok {
		ttfb = int(v)
	}
	out.Metadata["pageSpeed"] = true
	// MVP approximation: no browser engine yet, so infer UX metrics from network timing.
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
	pageWeightBytes, _ := intFromMeta(out.Metadata, "pageWeightBytes")
	score := pageSpeedScore(ttfb, lcpMs, out.ResponseMs, pageWeightBytes, maxTTFB, maxLCP, maxTotal, maxWeightKB)
	out.Metadata["performanceScore"] = score
	out.Metadata["performanceBudgets"] = map[string]interface{}{
		"maxTtfbMs":       maxTTFB,
		"maxLcpMs":        maxLCP,
		"maxTotalMs":      maxTotal,
		"maxPageWeightKb": maxWeightKB,
	}
	var violations []string
	if lcpMs > maxLCP {
		violations = append(violations, fmt.Sprintf("LCP %dms exceeds threshold %dms", lcpMs, maxLCP))
	}
	if ttfb > maxTTFB {
		violations = append(violations, fmt.Sprintf("TTFB %dms exceeds threshold %dms", ttfb, maxTTFB))
	}
	if out.ResponseMs > maxTotal {
		violations = append(violations, fmt.Sprintf("total load %dms exceeds threshold %dms", out.ResponseMs, maxTotal))
	}
	if pageWeightBytes > maxWeightKB*1024 {
		violations = append(violations, fmt.Sprintf("page weight %.1fKB exceeds threshold %dKB", float64(pageWeightBytes)/1024, maxWeightKB))
	}
	out.Metadata["budgetStatus"] = "pass"
	if len(violations) > 0 {
		out.Metadata["budgetStatus"] = "fail"
		out.Metadata["budgetViolations"] = violations
		out.IsUp = false
		out.ErrorMessage = strings.Join(violations, "; ")
	}
	return out
}

func pageSpeedScore(ttfb, lcp, total, pageWeightBytes, maxTTFB, maxLCP, maxTotal, maxWeightKB int) int {
	score := 100
	score -= penalty(ttfb, maxTTFB, 20)
	score -= penalty(lcp, maxLCP, 30)
	score -= penalty(total, maxTotal, 25)
	score -= penalty(pageWeightBytes/1024, maxWeightKB, 15)
	if score < 0 {
		return 0
	}
	return score
}

func penalty(value, budget, maxPenalty int) int {
	if budget <= 0 || value <= budget {
		return 0
	}
	overRatio := float64(value-budget) / float64(budget)
	p := int(overRatio * float64(maxPenalty) * 1.5)
	if p < 1 {
		p = 1
	}
	if p > maxPenalty {
		return maxPenalty
	}
	return p
}
