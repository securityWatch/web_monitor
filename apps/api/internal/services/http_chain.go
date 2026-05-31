package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"regexp"
	"sort"
	"strings"
	"time"
)

type stepResult struct {
	name       string
	method     string
	url        string
	statusCode int
	body       []byte
	headers    http.Header
	timings    HTTPTimings
	tls        *tls.ConnectionState
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
	return runSingleHTTP(ctx, targetURL, method, cfg.Body, cfg.Headers, expectedStatusesForConfig(cfg), cfg.Keyword, cfg.KeywordMustContain, cfg.JSONAssertions, monitorType, start, timeout)
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
				return failOutcomeWithMeta(start, fmt.Sprintf("step %d: url is required", i+1), metadata)
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
		res.name = stepLabel(step, i)
		res.method = strings.ToUpper(method)
		res.url = url

		stepMeta := chainStepMeta{Name: res.name, URL: url, Method: res.method, Timings: res.timings}
		if err != nil {
			stepMeta.Error = err.Error()
			appendChainStepMeta(metadata, stepMeta)
			return failOutcomeWithMeta(start, fmt.Sprintf("step %d (%s): %s", i+1, stepLabel(step, i), err.Error()), metadata)
		}
		stepMeta.StatusCode = res.statusCode
		appendChainStepMeta(metadata, stepMeta)
		last = res

		allowed := expectedStatusesForStep(step)
		if !statusAllowed(res.statusCode, allowed) {
			setPrimaryTimings(metadata, res.timings)
			return CheckOutcome{
				IsUp:         false,
				StatusCode:   &res.statusCode,
				ResponseMs:   elapsedMs(start),
				ErrorMessage: fmt.Sprintf("step %d (%s): expected status one of [%s], got %d", i+1, stepLabel(step, i), formatExpectedStatuses(allowed), res.statusCode),
				Metadata:     metadata,
			}
		}

		for _, rule := range step.Extract {
			val, err := applyExtractRule(rule, res)
			if err != nil {
				setPrimaryTimings(metadata, res.timings)
				return CheckOutcome{IsUp: false, StatusCode: &res.statusCode, ResponseMs: elapsedMs(start), ErrorMessage: fmt.Sprintf("step %d extract %q: %s", i+1, rule.Var, err.Error()), Metadata: metadata}
			}
			vars[rule.Var] = val
		}
	}

	code := last.statusCode
	setPrimaryTimings(metadata, last.timings)
	outcome := evaluateHTTPBody(last.body, code, elapsedMs(start), cfg.Keyword, cfg.KeywordMustContain, cfg.JSONAssertions, monitorType, metadata)
	if monitorType == "ssl" {
		if tlsMeta := sslMetaFromTLS(last.tls); tlsMeta != nil {
			for k, v := range tlsMeta {
				outcome.Metadata[k] = v
			}
		} else if tlsMeta := sslMetaFromTimingsRequest(ctx, last.url, timeout); tlsMeta != nil {
			for k, v := range tlsMeta {
				outcome.Metadata[k] = v
			}
		}
		return applySSLMonitorOutcome(outcome, monitorType)
	}
	return outcome
}

func runSingleHTTP(ctx context.Context, url, method, body string, headers map[string]string, allowedStatuses []int, keyword string, keywordMustContain bool, jsonAssertions []JSONAssertion, monitorType string, start time.Time, timeout time.Duration) CheckOutcome {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client := newHTTPClient(timeout)
	res, err := doHTTPRequest(ctx, client, method, url, body, headers)
	metadata := map[string]interface{}{}
	setPrimaryTimings(metadata, res.timings)

	if err != nil {
		return failOutcomeWithMeta(start, err.Error(), metadata)
	}

	if monitorType == "ssl" {
		if tlsMeta := sslMetaFromTLS(res.tls); tlsMeta != nil {
			for k, v := range tlsMeta {
				metadata[k] = v
			}
		}
	}

	if !statusAllowed(res.statusCode, allowedStatuses) {
		code := res.statusCode
		attachBodySnippet(metadata, res.body)
		return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsedMs(start), ErrorMessage: fmt.Sprintf("expected status one of [%s], got %d", formatExpectedStatuses(allowedStatuses), res.statusCode), Metadata: metadata}
	}

	if monitorType == "pagespeed" {
		attachPageSpeedSnapshot(metadata, res.body, res.headers, res.timings)
	}
	return applySSLMonitorOutcome(evaluateHTTPBody(res.body, res.statusCode, elapsedMs(start), keyword, keywordMustContain, jsonAssertions, monitorType, metadata), monitorType)
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

	collector := &timingCollector{}
	ctx = httptrace.WithClientTrace(ctx, collector.trace())
	reqStart := time.Now()

	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), url, bodyReader)
	if err != nil {
		return stepResult{timings: collector.result(reqStart, reqStart)}, err
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
		return stepResult{timings: collector.result(reqStart, time.Now())}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	bodyEnd := time.Now()
	return stepResult{
		statusCode: resp.StatusCode,
		body:       respBody,
		headers:    resp.Header,
		timings:    collector.result(reqStart, bodyEnd),
		tls:        resp.TLS,
	}, nil
}

func evaluateHTTPBody(body []byte, code, elapsed int, keyword string, keywordMustContain bool, jsonAssertions []JSONAssertion, monitorType string, metadata map[string]interface{}) CheckOutcome {
	if metadata == nil {
		metadata = map[string]interface{}{}
	}

	if monitorType == "api_json" {
		if len(jsonAssertions) == 0 {
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "at least one JSON assertion is required", Metadata: metadata}
		}
		if !json.Valid(body) {
			attachBodySnippet(metadata, body)
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "response is not valid JSON", Metadata: metadata}
		}
	}

	if monitorType == "api_json" {
		if len(jsonAssertions) == 0 {
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "at least one JSON assertion is required", Metadata: metadata}
		}
		if !json.Valid(body) {
			attachBodySnippet(metadata, body)
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "response is not valid JSON", Metadata: metadata}
		}
	}

	checkKeyword := monitorType == "keyword" || keyword != ""
	if checkKeyword && keyword != "" {
		found := strings.Contains(string(body), keyword)
		if keywordMustContain && !found {
			attachBodySnippet(metadata, body)
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "keyword not found", Metadata: metadata}
		}
		if !keywordMustContain && found {
			attachBodySnippet(metadata, body)
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: "keyword found (should not contain)", Metadata: metadata}
		}
	}

	for _, assert := range jsonAssertions {
		if err := evaluateJSONAssertion(body, assert); err != nil {
			attachBodySnippet(metadata, body)
			return CheckOutcome{IsUp: false, StatusCode: &code, ResponseMs: elapsed, ErrorMessage: err.Error(), Metadata: metadata}
		}
	}

	return CheckOutcome{IsUp: true, StatusCode: &code, ResponseMs: elapsed, Metadata: metadata}
}

func evaluateJSONAssertion(body []byte, assert JSONAssertion) error {
	if assert.Path == "" {
		return fmt.Errorf("json assertion path is required")
	}
	val, err := extractJSONPath(body, assert.Path)
	op := strings.ToLower(assert.Operator)
	if op == "" {
		op = "eq"
	}
	if op == "exists" {
		if err != nil {
			return fmt.Errorf("json path %q not found", assert.Path)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("json path %q: %v", assert.Path, err)
	}
	switch op {
	case "eq", "equals":
		if val != assert.Value {
			return fmt.Errorf("json %q expected %q, got %q", assert.Path, assert.Value, val)
		}
	case "ne", "not_equals":
		if val == assert.Value {
			return fmt.Errorf("json %q should not equal %q", assert.Path, assert.Value)
		}
	case "contains":
		if !strings.Contains(val, assert.Value) {
			return fmt.Errorf("json %q expected to contain %q, got %q", assert.Path, assert.Value, val)
		}
	default:
		return fmt.Errorf("unsupported json operator %q", assert.Operator)
	}
	return nil
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

func sslMetaFromTimingsRequest(ctx context.Context, url string, timeout time.Duration) map[string]interface{} {
	client := newHTTPClient(timeout)
	collector := &timingCollector{}
	ctx = httptrace.WithClientTrace(ctx, collector.trace())
	reqStart := time.Now()

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
	_ = collector.result(reqStart, time.Now())
	return sslMetaFromTLS(resp.TLS)
}

func sslMetaFromTLS(state *tls.ConnectionState) map[string]interface{} {
	if state == nil || len(state.PeerCertificates) == 0 {
		return nil
	}
	cert := state.PeerCertificates[0]
	meta := map[string]interface{}{}
	issuer := cert.Issuer.CommonName
	if issuer == "" && len(cert.Issuer.Organization) > 0 {
		issuer = cert.Issuer.Organization[0]
	}
	enrichSSLMeta(meta, cert.NotAfter, issuer, state.Version)
	return meta
}

func applySSLMonitorOutcome(out CheckOutcome, monitorType string) CheckOutcome {
	if monitorType != "ssl" {
		return out
	}
	days, ok := intFromMeta(out.Metadata, "sslDaysLeft")
	if !ok {
		out.IsUp = false
		if out.ErrorMessage == "" {
			out.ErrorMessage = "unable to read SSL certificate"
		}
		return out
	}
	if days < 0 {
		out.IsUp = false
		out.ErrorMessage = "SSL certificate expired"
	}
	return out
}

func stepLabel(step HTTPStep, index int) string {
	if step.Name != "" {
		return step.Name
	}
	return fmt.Sprintf("step %d", index+1)
}

func elapsedMs(start time.Time) int {
	ms := int(time.Since(start).Milliseconds())
	if ms < 1 {
		return 1
	}
	return ms
}

func attachBodySnippet(metadata map[string]interface{}, body []byte) {
	if len(body) == 0 || metadata == nil {
		return
	}
	const limit = 4096
	if len(body) > limit {
		metadata["responseBodySnippet"] = string(body[:limit])
	} else {
		metadata["responseBodySnippet"] = string(body)
	}
}

func attachPageSpeedSnapshot(metadata map[string]interface{}, body []byte, headers http.Header, timings HTTPTimings) {
	if metadata == nil {
		return
	}
	bodyLen := len(body)
	pageWeight := bodyLen
	if clen := parseContentLength(headers.Get("Content-Length")); clen > bodyLen {
		pageWeight = clen
	}
	metadata["htmlBytes"] = bodyLen
	metadata["pageWeightBytes"] = pageWeight
	metadata["resourceInventory"] = resourceInventory(body)
	metadata["navigationPhases"] = []map[string]interface{}{
		{"name": "dns", "durationMs": timings.DNSMs},
		{"name": "tcp", "durationMs": timings.TCPMs},
		{"name": "tls", "durationMs": timings.TLSMs},
		{"name": "ttfb", "durationMs": timings.TTFBMs},
		{"name": "download", "durationMs": timings.DownloadMs},
	}
}

func parseContentLength(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	n := 0
	for _, r := range raw {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func resourceInventory(body []byte) map[string]interface{} {
	html := string(body)
	count := func(pattern string) int {
		return len(regexp.MustCompile(pattern).FindAllStringIndex(html, -1))
	}
	items := map[string]int{
		"scripts":     count(`(?i)<script\b`),
		"stylesheets": count(`(?i)<link\b[^>]+rel=["']?stylesheet`),
		"images":      count(`(?i)<img\b`),
		"iframes":     count(`(?i)<iframe\b`),
		"videos":      count(`(?i)<video\b`),
	}
	total := 0
	keys := make([]string, 0, len(items))
	for k, v := range items {
		keys = append(keys, k)
		total += v
	}
	sort.Strings(keys)
	byType := map[string]interface{}{}
	for _, k := range keys {
		byType[k] = items[k]
	}
	return map[string]interface{}{"total": total, "byType": byType}
}
