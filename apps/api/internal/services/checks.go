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
	case "tcp":
		return runTCPCheck(ctx, targetURL, start)
	case "ping":
		return runPingCheck(ctx, targetURL, start)
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
