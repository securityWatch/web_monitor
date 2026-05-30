package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
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
		return CheckOutcome{IsUp: true, StatusCode: &code, ResponseMs: elapsed, Metadata: meta}
	}

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

	// ML moderation stub — off by default.
	if mlEnabled, _ := cfg["mlModerationEnabled"].(bool); mlEnabled {
		meta["mlModeration"] = "skipped_stub"
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
		"dnsBaseline":      recs,
		"dnsBaselineRecords": recs,
		"baselineCapturedAt": time.Now().UTC().Format(time.RFC3339),
	}
	if h, ok := out.Metadata["baselineHash"].(string); ok {
		patch["baselineHash"] = h
	}
	return patch, nil
}
