package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"sort"
	"strings"
	"time"
)

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

	resolvers := parseTrustedResolvers(cfg)
	var addrs []string
	var resolverResults map[string][]string
	var err error

	if len(resolvers) >= 2 {
		resolverResults, err = lookupMultiResolver(ctx, host, recordType, resolvers)
		if err != nil {
			elapsed := int(time.Since(start).Milliseconds())
			return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: err.Error()}
		}
		if mismatch := resolverResultsMismatch(resolverResults); mismatch {
			elapsed := int(time.Since(start).Milliseconds())
			meta := map[string]interface{}{
				"recordType":       recordType,
				"resolverMismatch": true,
				"resolverResults":  resolverResults,
			}
			return CheckOutcome{
				IsUp:         false,
				ResponseMs:   elapsed,
				ErrorMessage: "DNS resolver results disagree (possible hijack)",
				Metadata:     meta,
			}
		}
		for _, recs := range resolverResults {
			addrs = recs
			break
		}
	} else {
		addrs, err = lookupDNS(ctx, host, recordType, "")
	}

	elapsed := int(time.Since(start).Milliseconds())
	if err != nil || len(addrs) == 0 {
		msg := "DNS lookup failed"
		if err != nil {
			msg = err.Error()
		}
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: msg}
	}

	addrs = normalizeRecords(addrs)
	meta := map[string]interface{}{
		"records":    addrs,
		"recordType": recordType,
	}
	if len(resolvers) >= 2 {
		meta["trustedResolvers"] = resolvers
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
			return CheckOutcome{
				IsUp:         false,
				ResponseMs:   elapsed,
				ErrorMessage: fmt.Sprintf("expected %q not in records", expected),
				Metadata:     meta,
			}
		}
	}

	baselineMode := "auto"
	if v, ok := cfg["baselineMode"].(string); ok && v != "" {
		baselineMode = strings.ToLower(v)
	}

	baseline := parseDNSBaseline(cfg)
	currentHash := recordsHash(addrs)
	meta["baselineHash"] = currentHash

	if len(baseline) == 0 {
		if baselineMode != "manual" {
			meta["establishBaseline"] = true
			meta["dnsBaselineRecords"] = addrs
		}
		return CheckOutcome{IsUp: true, ResponseMs: elapsed, Metadata: meta}
	}

	if !recordsEqual(baseline, addrs) {
		meta["dnsChanged"] = true
		meta["previous"] = baseline
		meta["current"] = addrs
		meta["changed"] = true
		return CheckOutcome{
			IsUp:         true,
			ResponseMs:   elapsed,
			ErrorMessage: fmt.Sprintf("DNS %s records changed", recordType),
			Metadata:     meta,
		}
	}

	return CheckOutcome{IsUp: true, ResponseMs: elapsed, Metadata: meta}
}

func parseTrustedResolvers(cfg map[string]interface{}) []string {
	raw, ok := cfg["trustedResolvers"].([]interface{})
	if !ok || len(raw) == 0 {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, r := range raw {
		if s, ok := r.(string); ok && strings.TrimSpace(s) != "" {
			addr := strings.TrimSpace(s)
			if !strings.Contains(addr, ":") {
				addr += ":53"
			}
			out = append(out, addr)
		}
	}
	return out
}

func parseDNSBaseline(cfg map[string]interface{}) []string {
	if raw, ok := cfg["dnsBaseline"].([]interface{}); ok {
		return interfaceToStrings(raw)
	}
	if raw, ok := cfg["dnsBaselineRecords"].([]interface{}); ok {
		return interfaceToStrings(raw)
	}
	return nil
}

func interfaceToStrings(raw []interface{}) []string {
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return normalizeRecords(out)
}

func normalizeRecords(records []string) []string {
	out := make([]string, 0, len(records))
	for _, r := range records {
		r = strings.TrimSpace(strings.TrimSuffix(r, "."))
		if r != "" {
			out = append(out, r)
		}
	}
	sort.Strings(out)
	return out
}

func recordsEqual(a, b []string) bool {
	return recordsHash(a) == recordsHash(b)
}

func recordsHash(records []string) string {
	sorted := normalizeRecords(records)
	h := sha256.Sum256([]byte(strings.Join(sorted, "|")))
	return hex.EncodeToString(h[:])
}

func lookupMultiResolver(ctx context.Context, host, recordType string, resolvers []string) (map[string][]string, error) {
	results := make(map[string][]string, len(resolvers))
	for _, res := range resolvers {
		recs, err := lookupDNS(ctx, host, recordType, res)
		if err != nil {
			return nil, fmt.Errorf("resolver %s: %w", res, err)
		}
		results[res] = normalizeRecords(recs)
	}
	return results, nil
}

func resolverResultsMismatch(results map[string][]string) bool {
	if len(results) < 2 {
		return false
	}
	var first []string
	for _, recs := range results {
		if first == nil {
			first = recs
			continue
		}
		if !recordsEqual(first, recs) {
			return true
		}
	}
	return false
}

func lookupDNS(ctx context.Context, host, recordType, resolverAddr string) ([]string, error) {
	var r *net.Resolver
	if resolverAddr != "" {
		r = &net.Resolver{
			PreferGo: true,
			Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
				d := net.Dialer{Timeout: 5 * time.Second}
				return d.DialContext(ctx, "udp", resolverAddr)
			},
		}
	} else {
		r = net.DefaultResolver
	}

	switch recordType {
	case "AAAA", "A":
		return r.LookupHost(ctx, host)
	case "CNAME":
		cname, err := r.LookupCNAME(ctx, host)
		if err != nil {
			return nil, err
		}
		if cname == "" {
			return nil, fmt.Errorf("no CNAME record")
		}
		return []string{cname}, nil
	case "MX":
		mxs, err := r.LookupMX(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(mxs) == 0 {
			return nil, fmt.Errorf("no MX records")
		}
		out := make([]string, 0, len(mxs))
		for _, mx := range mxs {
			out = append(out, mx.Host)
		}
		return out, nil
	default:
		return r.LookupHost(ctx, host)
	}
}
