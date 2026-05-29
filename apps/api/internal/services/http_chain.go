package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type stepResult struct {
	name       string
	statusCode int
	body       []byte
	headers    http.Header
}

func executeHTTPMonitor(ctx context.Context, targetURL string, cfg HTTPMonitorConfig, monitorType string, start time.Time) CheckOutcome {
	timeout := 30 * time.Second
	if cfg.Timeout > 0 {
		timeout = time.Duration(cfg.Timeout * float64(time.Second))
	}

	if len(cfg.Steps) > 0 {
		if err := validateChainSteps(cfg.Steps); err != nil {
			return failOutcome(start, err.Error())
		}
		return runHTTPChain(ctx, targetURL, cfg, monitorType, start, timeout)
	}

	method := cfg.Method
	if method == "" {
		method = "GET"
	}
	expected := cfg.ExpectedStatus
	if expected == 0 {
		expected = 200
	}
	return runSingleHTTP(ctx, targetURL, method, cfg.Body, cfg.Headers, expected, cfg.Keyword, cfg.KeywordMustContain, monitorType, start, timeout)
}

func runHTTPChain(ctx context.Context, targetURL string, cfg HTTPMonitorConfig, monitorType string, start time.Time, timeout time.Duration) CheckOutcome {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client := newHTTPClient(timeout)
	vars := map[string]string{}
	var last stepResult
	metadata := map[string]interface{}{"chainSteps": len(cfg.Steps)}

	for i, step := range cfg.Steps {
		url := step.URL
		if url == "" {
			if i == 0 {
				url = targetURL
			} else {
				return failOutcome(start, fmt.Sprintf("step %d: url is required", i+1))
			}
		}
		url = substituteVars(url, vars)

		method := step.Method
		if method == "" {
			method = "GET"
		}
		body := substituteVars(step.Body, vars)
		headers := map[string]string{}
		for k, v := range cfg.Headers {
			headers[k] = substituteVars(v, vars)
		}
		for k, v := range step.Headers {
			headers[k] = substituteVars(v, vars)
		}

		res, err := doHTTPRequest(ctx, client, method, url, body, headers)
		if err != nil {
			return CheckOutcome{IsUp: false, ResponseMs: elapsedMs(start), ErrorMessage: fmt.Sprintf("step %d (%s): %s", i+1, stepLabel(step, i), err.Error()), Metadata: metadata}
		}
		last = res

		expected := step.ExpectedStatus
		if expected == 0 {
			expected = 200
		}
		if res.statusCode != expected {
			return CheckOutcome{
				IsUp:         false,
				StatusCode:   &res.statusCode,
				ResponseMs:   elapsedMs(start),
				ErrorMessage: fmt.Sprintf("step %d (%s): expected status %d, got %d", i+1, stepLabel(step, i), expected, res.statusCode),
				Metadata:     metadata,
			}
		}

		for _, rule := range step.Extract {
			val, err := applyExtractRule(rule, res)
			if err != nil {
				return CheckOutcome{IsUp: false, StatusCode: &res.statusCode, ResponseMs: elapsedMs(start), ErrorMessage: fmt.Sprintf("step %d extract %q: %s", i+1, rule.Var, err.Error()), Metadata: metadata}
			}
			vars[rule.Var] = val
		}
	}

	elapsed := elapsedMs(start)
	code := last.statusCode
	outcome := evaluateHTTPBody(last.body, code, elapsed, cfg.Keyword, cfg.KeywordMustContain, monitorType, metadata)
	if monitorType == "ssl" {
		// SSL metadata requires TLS info from transport; chain checks skip cert parsing for now
	}
	return outcome
}

func runSingleHTTP(ctx context.Context, url, method, body string, headers map[string]string, expectedStatus int, keyword string, keywordMustContain bool, monitorType string, start time.Time, timeout time.Duration) CheckOutcome {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client := newHTTPClient(timeout)
	res, err := doHTTPRequest(ctx, client, method, url, body, headers)
	if err != nil {
		return failOutcome(start, err.Error())
	}

	metadata := map[string]interface{}{}
	if monitorType == "ssl" {
		// Re-run with TLS-aware client for SSL monitors when using simple GET
		if tlsMeta := fetchSSLMetadata(ctx, url, timeout); tlsMeta != nil {
			metadata = tlsMeta
		}
	}

	if res.statusCode != expectedStatus {
		code := res.statusCode
		return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsedMs(start), ErrorMessage: fmt.Sprintf("expected status %d, got %d", expectedStatus, res.statusCode), Metadata: metadata}
	}

	return evaluateHTTPBody(res.body, res.statusCode, elapsedMs(start), keyword, keywordMustContain, monitorType, metadata)
}

func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
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
}

func doHTTPRequest(ctx context.Context, client *http.Client, method, url, body string, headers map[string]string) (stepResult, error) {
	var bodyReader io.Reader
	if body != "" {
		if len(body) > maxBodyBytes {
			return stepResult{}, fmt.Errorf("request body exceeds %d bytes", maxBodyBytes)
		}
		bodyReader = strings.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), url, bodyReader)
	if err != nil {
		return stepResult{}, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		trim := strings.TrimSpace(body)
		if strings.HasPrefix(trim, "{") || strings.HasPrefix(trim, "[") {
			req.Header.Set("Content-Type", "application/json")
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		return stepResult{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	return stepResult{statusCode: resp.StatusCode, body: respBody, headers: resp.Header}, nil
}

func evaluateHTTPBody(body []byte, code, elapsed int, keyword string, keywordMustContain bool, monitorType string, metadata map[string]interface{}) CheckOutcome {
	if metadata == nil {
		metadata = map[string]interface{}{}
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

	return CheckOutcome{IsUp: true, StatusCode: &code, ResponseMs: elapsed, Metadata: metadata}
}

func applyExtractRule(rule HTTPExtractRule, res stepResult) (string, error) {
	switch rule.From {
	case "json":
		return extractJSONPath(res.body, rule.Path)
	case "regex":
		re, err := regexp.Compile(rule.Pattern)
		if err != nil {
			return "", fmt.Errorf("invalid regex: %w", err)
		}
		m := re.FindStringSubmatch(string(res.body))
		if len(m) < 2 {
			return "", fmt.Errorf("pattern did not match")
		}
		return m[1], nil
	case "header":
		vals := res.headers.Values(rule.Path)
		if len(vals) == 0 {
			return "", fmt.Errorf("header %q not found", rule.Path)
		}
		return vals[0], nil
	default:
		return "", fmt.Errorf("unsupported extract type %q", rule.From)
	}
}

func extractJSONPath(data []byte, path string) (string, error) {
	var root interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return "", fmt.Errorf("invalid json response")
	}
	current := root
	for _, part := range strings.Split(path, ".") {
		if part == "" {
			continue
		}
		m, ok := current.(map[string]interface{})
		if !ok {
			return "", fmt.Errorf("path %q not found", path)
		}
		current, ok = m[part]
		if !ok {
			return "", fmt.Errorf("path %q not found", path)
		}
	}
	switch v := current.(type) {
	case string:
		return v, nil
	case float64:
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v)), nil
		}
		return fmt.Sprintf("%v", v), nil
	case bool:
		return fmt.Sprintf("%v", v), nil
	default:
		b, _ := json.Marshal(v)
		return string(b), nil
	}
}

func fetchSSLMetadata(ctx context.Context, url string, timeout time.Duration) map[string]interface{} {
	client := newHTTPClient(timeout)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.TLS == nil || len(resp.TLS.PeerCertificates) == 0 {
		return nil
	}
	cert := resp.TLS.PeerCertificates[0]
	daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
	meta := map[string]interface{}{
		"sslDaysLeft":  daysLeft,
		"sslExpiresAt": cert.NotAfter.Format(time.RFC3339),
	}
	if daysLeft < 30 {
		meta["sslWarning"] = true
	}
	return meta
}

func stepLabel(step HTTPStep, index int) string {
	if step.Name != "" {
		return step.Name
	}
	return fmt.Sprintf("step %d", index+1)
}

func elapsedMs(start time.Time) int {
	return int(time.Since(start).Milliseconds())
}
