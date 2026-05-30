package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	htmlstd "html"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	deepSeekDefaultBaseURL = "https://api.deepseek.com"
	deepSeekDefaultModel   = "deepseek-chat"
	tamperAITextLimit      = 6000
)

var defaultGamblingKeywords = []string{
	"casino", "gambling", "bet365", "sportsbet", "poker", "slot machine",
	"博彩", "赌博", "赌场", "投注", "六合彩",
}

var defaultAdultKeywords = []string{
	"porn", "xxx", "adult content", "nsfw",
	"色情", "成人视频", "裸聊",
}

func runTamperCheck(ctx context.Context, targetURL string, config json.RawMessage, start time.Time) CheckOutcome {
	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)

	timeout := 30 * time.Second
	if v, ok := cfg["timeout"].(float64); ok && v > 0 {
		timeout = time.Duration(v * float64(time.Second))
	}

	url := targetURL
	if !strings.HasPrefix(url, "http") {
		url = "https://" + url
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return failOutcome(start, err.Error())
	}
	req.Header.Set("User-Agent", "PulseWatch-Tamper/1.0")

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: err.Error()}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: err.Error()}
	}

	code := resp.StatusCode
	if code >= 400 {
		return CheckOutcome{
			IsUp:         false,
			StatusCode:   &code,
			ResponseMs:   elapsed,
			ErrorMessage: fmt.Sprintf("HTTP %d", code),
		}
	}

	selectors := parseStringSlice(cfg["selectors"])
	content := string(body)
	if len(selectors) > 0 {
		content = extractSelectorRegions(content, selectors)
	}
	normalized := normalizeTamperBody(content)
	bodyHash := hashBytes(normalized)

	meta := map[string]interface{}{
		"bodyHash":     bodyHash,
		"contentBytes": len(normalized),
	}

	baselineHash := ""
	if v, ok := cfg["baselineHash"].(string); ok {
		baselineHash = v
	}
	baselineSize := 0
	if v, ok := cfg["baselineSize"].(float64); ok {
		baselineSize = int(v)
	}

	changeThreshold := 10.0
	if v, ok := cfg["changeThresholdPercent"].(float64); ok && v > 0 {
		changeThreshold = v
	}

	if baselineHash == "" {
		meta["establishBaseline"] = true
		meta["baselineHash"] = bodyHash
		meta["baselineSize"] = len(normalized)
		meta["baselineCapturedAt"] = start.UTC().Format(time.RFC3339)
	} else {
		meta["baselineHash"] = baselineHash
		diffPercent := tamperDiffPercent(baselineHash, bodyHash, baselineSize, len(normalized))
		meta["diffPercent"] = diffPercent

		if diffPercent >= changeThreshold {
			detectMajor := true
			if v, ok := cfg["detectMajorChange"].(bool); ok {
				detectMajor = v
			}
			if detectMajor {
				meta["tamperMajorChange"] = true
				meta["diffSummary"] = fmt.Sprintf("Content changed ~%.0f%% (threshold %.0f%%)", diffPercent, changeThreshold)
				if len(normalized) > 2048 {
					meta["contentSnippet"] = string(normalized[:2048])
				} else {
					meta["contentSnippet"] = string(normalized)
				}
			}
		}
	}

	policy := parsePolicyCategories(cfg)
	consent, _ := cfg["contentScanConsent"].(bool)
	if policyEnabled(policy) && consent {
		matched := matchBlocklist(string(body), cfg, policy)
		if len(matched) > 0 {
			meta["tamperPolicyViolation"] = true
			meta["matchedKeywords"] = matched
			meta["policySummary"] = fmt.Sprintf("Matched %d blocklist term(s)", len(matched))
		}
	}

	if tamperAIRecognitionEnabledFromMap(cfg) {
		result, err := recognizeTamperContentWithDeepSeek(ctx, url, extractVisibleText(content))
		if err != nil {
			meta["aiContentRecognition"] = map[string]interface{}{
				"provider": "deepseek",
				"status":   "error",
				"error":    err.Error(),
			}
		} else {
			aiMeta := map[string]interface{}{
				"provider":   "deepseek",
				"model":      result.Model,
				"status":     "ok",
				"flagged":    result.Flagged,
				"riskLevel":  result.RiskLevel,
				"categories": result.Categories,
				"summary":    result.Summary,
				"confidence": result.Confidence,
			}
			meta["aiContentRecognition"] = aiMeta
			if result.Flagged {
				meta["tamperAIContentViolation"] = true
				meta["aiPolicySummary"] = formatAIContentSummary(result)
			}
		}
	}

	isUp := true
	errMsg := ""
	if meta["tamperMajorChange"] == true {
		isUp = false
		errMsg = meta["diffSummary"].(string)
	}
	if meta["tamperPolicyViolation"] == true {
		isUp = false
		if errMsg == "" {
			errMsg = meta["policySummary"].(string)
		}
	}
	if meta["tamperAIContentViolation"] == true {
		isUp = false
		if errMsg == "" {
			errMsg, _ = meta["aiPolicySummary"].(string)
		}
	}

	return CheckOutcome{
		IsUp:         isUp,
		StatusCode:   &code,
		ResponseMs:   elapsed,
		ErrorMessage: errMsg,
		Metadata:     meta,
	}
}

func normalizeTamperBody(body string) []byte {
	re := regexp.MustCompile(`\s+`)
	s := re.ReplaceAllString(body, " ")
	return []byte(strings.TrimSpace(s))
}

func hashBytes(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func tamperDiffPercent(baselineHash, currentHash string, baselineSize, currentSize int) float64 {
	if baselineHash == currentHash {
		return 0
	}
	maxSize := baselineSize
	if currentSize > maxSize {
		maxSize = currentSize
	}
	sizeChange := 0.0
	if maxSize > 0 {
		diff := baselineSize - currentSize
		if diff < 0 {
			diff = -diff
		}
		sizeChange = float64(diff) / float64(maxSize) * 100
	}
	if baselineHash != currentHash {
		if sizeChange < 100 {
			sizeChange = 100
		}
	}
	return sizeChange
}

func extractSelectorRegions(html string, selectors []string) string {
	var parts []string
	lower := strings.ToLower(html)
	for _, sel := range selectors {
		sel = strings.TrimSpace(sel)
		if sel == "" {
			continue
		}
		// MVP: match id="sel" or class="sel" regions (first 4KB after match).
		patterns := []string{
			fmt.Sprintf(`(?is)id=["']%s["'][^>]*>.*?(?:</[^>]+>|$)`, regexp.QuoteMeta(sel)),
			fmt.Sprintf(`(?is)class=["'][^"']*%s[^"']*["'][^>]*>.*?(?:</[^>]+>|$)`, regexp.QuoteMeta(sel)),
		}
		for _, p := range patterns {
			re := regexp.MustCompile(p)
			if m := re.FindString(lower); m != "" {
				parts = append(parts, m)
				break
			}
		}
	}
	if len(parts) == 0 {
		return html
	}
	return strings.Join(parts, "\n")
}

type policyCategories struct {
	gambling bool
	adult    bool
}

func parsePolicyCategories(cfg map[string]interface{}) policyCategories {
	var p policyCategories
	raw, ok := cfg["policyCategories"].(map[string]interface{})
	if !ok {
		return p
	}
	p.gambling, _ = raw["gambling"].(bool)
	p.adult, _ = raw["adult"].(bool)
	return p
}

func policyEnabled(p policyCategories) bool {
	return p.gambling || p.adult
}

func matchBlocklist(body string, cfg map[string]interface{}, policy policyCategories) []string {
	keywords := append([]string{}, parseStringSlice(cfg["customBlocklist"])...)
	if policy.gambling {
		keywords = append(keywords, defaultGamblingKeywords...)
	}
	if policy.adult {
		keywords = append(keywords, defaultAdultKeywords...)
	}
	lower := strings.ToLower(body)
	var matched []string
	seen := map[string]bool{}
	for _, kw := range keywords {
		kw = strings.TrimSpace(kw)
		if kw == "" || seen[kw] {
			continue
		}
		if strings.Contains(lower, strings.ToLower(kw)) {
			matched = append(matched, kw)
			seen[kw] = true
			if len(matched) >= 10 {
				break
			}
		}
	}
	return matched
}

func parseStringSlice(raw interface{}) []string {
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func TamperAIRecognitionEnabled(config json.RawMessage) bool {
	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)
	return tamperAIRecognitionEnabledFromMap(cfg)
}

func tamperAIRecognitionEnabledFromMap(cfg map[string]interface{}) bool {
	enabled, _ := cfg["aiContentRecognitionEnabled"].(bool)
	return enabled
}

type tamperAIRecognitionResult struct {
	Flagged    bool
	RiskLevel  string
	Categories []string
	Summary    string
	Confidence float64
	Model      string
}

func recognizeTamperContentWithDeepSeek(ctx context.Context, targetURL, text string) (tamperAIRecognitionResult, error) {
	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" {
		return tamperAIRecognitionResult{}, errors.New("DeepSeek API key not configured")
	}
	model := strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL"))
	if model == "" {
		model = deepSeekDefaultModel
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("DEEPSEEK_API_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = deepSeekDefaultBaseURL
	}
	if len(text) > tamperAITextLimit {
		text = text[:tamperAITextLimit]
	}

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a website tamper and content-safety classifier. Return only compact JSON with keys flagged(boolean), riskLevel(one of none,low,medium,high), categories(array), summary(string), confidence(number 0-1). Flag only likely defacement, phishing, gambling, adult/NSFW, malware, spam injection, or illegal content inserted into a normal website.",
			},
			{
				"role":    "user",
				"content": fmt.Sprintf("URL: %s\n\nVisible page text:\n%s", targetURL, text),
			},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return tamperAIRecognitionResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 25 * time.Second}).Do(req)
	if err != nil {
		return tamperAIRecognitionResult{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode >= 300 {
		return tamperAIRecognitionResult{}, fmt.Errorf("DeepSeek API returned HTTP %d", resp.StatusCode)
	}

	var envelope struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return tamperAIRecognitionResult{}, err
	}
	if len(envelope.Choices) == 0 || strings.TrimSpace(envelope.Choices[0].Message.Content) == "" {
		return tamperAIRecognitionResult{}, errors.New("DeepSeek API returned empty content")
	}

	var parsed struct {
		Flagged    bool     `json:"flagged"`
		RiskLevel  string   `json:"riskLevel"`
		Categories []string `json:"categories"`
		Summary    string   `json:"summary"`
		Confidence float64  `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(stripJSONCodeFence(envelope.Choices[0].Message.Content)), &parsed); err != nil {
		return tamperAIRecognitionResult{}, err
	}

	return sanitizeTamperAIResult(parsed.Flagged, parsed.RiskLevel, parsed.Categories, parsed.Summary, parsed.Confidence, model), nil
}

func stripJSONCodeFence(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func sanitizeTamperAIResult(flagged bool, riskLevel string, categories []string, summary string, confidence float64, model string) tamperAIRecognitionResult {
	riskLevel = strings.ToLower(strings.TrimSpace(riskLevel))
	switch riskLevel {
	case "none", "low", "medium", "high":
	default:
		if flagged {
			riskLevel = "medium"
		} else {
			riskLevel = "none"
		}
	}
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 1 {
		confidence = 1
	}
	cleanCategories := make([]string, 0, len(categories))
	seen := map[string]bool{}
	for _, c := range categories {
		c = strings.ToLower(strings.TrimSpace(c))
		if c == "" || seen[c] {
			continue
		}
		cleanCategories = append(cleanCategories, c)
		seen[c] = true
		if len(cleanCategories) >= 6 {
			break
		}
	}
	summary = strings.TrimSpace(summary)
	if len(summary) > 240 {
		summary = summary[:240]
	}
	if summary == "" && flagged {
		summary = "AI content risk detected"
	}
	return tamperAIRecognitionResult{Flagged: flagged, RiskLevel: riskLevel, Categories: cleanCategories, Summary: summary, Confidence: confidence, Model: model}
}

func formatAIContentSummary(result tamperAIRecognitionResult) string {
	parts := []string{}
	if result.RiskLevel != "" {
		parts = append(parts, "risk="+result.RiskLevel)
	}
	if len(result.Categories) > 0 {
		parts = append(parts, "categories="+strings.Join(result.Categories, ","))
	}
	if result.Summary != "" {
		parts = append(parts, result.Summary)
	}
	if len(parts) == 0 {
		return "AI content risk detected"
	}
	return "AI content risk detected: " + strings.Join(parts, " | ")
}

func extractVisibleText(html string) string {
	text := html
	for _, pattern := range []string{
		`(?is)<script[^>]*>.*?</script>`,
		`(?is)<style[^>]*>.*?</style>`,
		`(?is)<noscript[^>]*>.*?</noscript>`,
		`(?is)<svg[^>]*>.*?</svg>`,
	} {
		text = regexp.MustCompile(pattern).ReplaceAllString(text, " ")
	}
	text = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(text, " ")
	text = htmlstd.UnescapeString(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

// CaptureTamperBaseline fetches the page and returns config fields for baseline.
func CaptureTamperBaseline(ctx context.Context, targetURL string, config json.RawMessage) (map[string]interface{}, error) {
	out := runTamperCheck(ctx, targetURL, config, time.Now())
	if !out.IsUp && out.Metadata["establishBaseline"] != true {
		if out.ErrorMessage != "" {
			return nil, errors.New(out.ErrorMessage)
		}
	}
	patch := map[string]interface{}{}
	if h, ok := out.Metadata["bodyHash"].(string); ok {
		patch["baselineHash"] = h
	}
	if s, ok := out.Metadata["contentBytes"].(int); ok {
		patch["baselineSize"] = s
	}
	patch["baselineCapturedAt"] = time.Now().UTC().Format(time.RFC3339)
	return patch, nil
}

// CaptureDNSBaseline performs lookup and returns baseline records.
func CaptureDNSBaseline(ctx context.Context, target string, config json.RawMessage) (map[string]interface{}, error) {
	out := runDNSCheck(ctx, target, config, time.Now())
	if !out.IsUp {
		return nil, errors.New(out.ErrorMessage)
	}
	recs, _ := out.Metadata["records"].([]string)
	if recs == nil {
		if raw, ok := out.Metadata["records"].([]interface{}); ok {
			recs = interfaceToStrings(raw)
		}
	}
	patch := map[string]interface{}{
		"dnsBaseline":        recs,
		"dnsBaselineRecords": recs,
		"baselineCapturedAt": time.Now().UTC().Format(time.RFC3339),
	}
	if h, ok := out.Metadata["baselineHash"].(string); ok {
		patch["baselineHash"] = h
	}
	return patch, nil
}
