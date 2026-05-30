package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type rdapDomain struct {
	Events []struct {
		EventAction string `json:"eventAction"`
		EventDate   string `json:"eventDate"`
	} `json:"events"`
}

func runDomainCheck(ctx context.Context, target string, config json.RawMessage, start time.Time) CheckOutcome {
	cfg := map[string]interface{}{}
	_ = json.Unmarshal(config, &cfg)
	warnDays := 30
	if v, ok := cfg["warnDays"].(float64); ok && v > 0 {
		warnDays = int(v)
	}

	domain := strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(target), "domain://"), "http://")
	domain = strings.Split(domain, "/")[0]
	domain = strings.ToLower(domain)
	if domain == "" {
		return failOutcome(start, "domain required")
	}

	expiry, err := lookupDomainExpiry(ctx, domain)
	elapsed := int(time.Since(start).Milliseconds())
	if err != nil {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: err.Error()}
	}

	daysLeft := int(time.Until(expiry).Hours() / 24)
	meta := map[string]interface{}{
		"domainExpiry": expiry.Format(time.RFC3339),
		"domainDaysLeft": daysLeft,
	}
	if daysLeft < 0 {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: "domain expired", Metadata: meta}
	}
	if daysLeft <= warnDays {
		return CheckOutcome{IsUp: false, ResponseMs: elapsed, ErrorMessage: fmt.Sprintf("domain expires in %d days", daysLeft), Metadata: meta}
	}
	return CheckOutcome{IsUp: true, ResponseMs: elapsed, Metadata: meta}
}

func lookupDomainExpiry(ctx context.Context, domain string) (time.Time, error) {
	url := "https://rdap.org/domain/" + domain
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return time.Time{}, err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return time.Time{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return time.Time{}, fmt.Errorf("rdap lookup failed: %s", strings.TrimSpace(string(body)))
	}
	var data rdapDomain
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return time.Time{}, err
	}
	for _, ev := range data.Events {
		if strings.EqualFold(ev.EventAction, "expiration") && ev.EventDate != "" {
			t, err := time.Parse(time.RFC3339, ev.EventDate)
			if err != nil {
				t, err = time.Parse("2006-01-02T15:04:05Z", ev.EventDate)
			}
			if err == nil {
				return t, nil
			}
		}
	}
	return time.Time{}, fmt.Errorf("expiration date not found in RDAP")
}
