package services

import (
	"crypto/tls"
	"net/http/httptrace"
	"time"
)

// HTTPTimings breaks down a single HTTP request for troubleshooting.
type HTTPTimings struct {
	DNSMs      int `json:"dnsMs,omitempty"`
	TCPMs      int `json:"tcpMs,omitempty"`
	TLSMs      int `json:"tlsMs,omitempty"`
	TTFBMs     int `json:"ttfbMs,omitempty"`
	DownloadMs int `json:"downloadMs,omitempty"`
	TotalMs    int `json:"totalMs"`
}

type chainStepMeta struct {
	Name       string      `json:"name,omitempty"`
	URL        string      `json:"url,omitempty"`
	Method     string      `json:"method,omitempty"`
	StatusCode int         `json:"statusCode,omitempty"`
	Timings    HTTPTimings `json:"timings"`
	Error      string      `json:"error,omitempty"`
}

func timingsToMap(t HTTPTimings) map[string]interface{} {
	m := map[string]interface{}{
		"totalMs": t.TotalMs,
	}
	if t.DNSMs > 0 {
		m["dnsMs"] = t.DNSMs
	}
	if t.TCPMs > 0 {
		m["tcpMs"] = t.TCPMs
	}
	if t.TLSMs > 0 {
		m["tlsMs"] = t.TLSMs
	}
	if t.TTFBMs > 0 {
		m["ttfbMs"] = t.TTFBMs
	}
	if t.DownloadMs > 0 {
		m["downloadMs"] = t.DownloadMs
	}
	return m
}

func setPrimaryTimings(meta map[string]interface{}, t HTTPTimings) {
	meta["timings"] = timingsToMap(t)
}

func appendChainStepMeta(meta map[string]interface{}, step chainStepMeta) {
	var list []map[string]interface{}
	if raw, ok := meta["chainStepDetails"]; ok {
		if existing, ok := raw.([]map[string]interface{}); ok {
			list = existing
		}
	}
	entry := map[string]interface{}{
		"timings": timingsToMap(step.Timings),
	}
	if step.Name != "" {
		entry["name"] = step.Name
	}
	if step.URL != "" {
		entry["url"] = step.URL
	}
	if step.Method != "" {
		entry["method"] = step.Method
	}
	if step.StatusCode > 0 {
		entry["statusCode"] = step.StatusCode
	}
	if step.Error != "" {
		entry["error"] = step.Error
	}
	meta["chainStepDetails"] = append(list, entry)
}

type timingCollector struct {
	dnsStart     time.Time
	connectStart time.Time
	tlsStart     time.Time
	wroteRequest time.Time
	firstByte    time.Time

	dnsMs  int
	tcpMs  int
	tlsMs  int
	ttfbMs int
}

func (c *timingCollector) trace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart: func(httptrace.DNSStartInfo) {
			c.dnsStart = time.Now()
		},
		DNSDone: func(httptrace.DNSDoneInfo) {
			if !c.dnsStart.IsZero() {
				c.dnsMs = int(time.Since(c.dnsStart).Milliseconds())
			}
		},
		ConnectStart: func(string, string) {
			c.connectStart = time.Now()
		},
		ConnectDone: func(string, string, error) {
			if !c.connectStart.IsZero() {
				c.tcpMs = int(time.Since(c.connectStart).Milliseconds())
			}
		},
		TLSHandshakeStart: func() {
			c.tlsStart = time.Now()
		},
		TLSHandshakeDone: func(tls.ConnectionState, error) {
			if !c.tlsStart.IsZero() {
				c.tlsMs = int(time.Since(c.tlsStart).Milliseconds())
			}
		},
		WroteRequest: func(httptrace.WroteRequestInfo) {
			c.wroteRequest = time.Now()
		},
		GotFirstResponseByte: func() {
			c.firstByte = time.Now()
			if !c.wroteRequest.IsZero() {
				c.ttfbMs = int(c.firstByte.Sub(c.wroteRequest).Milliseconds())
			}
		},
	}
}

func (c *timingCollector) result(start, bodyEnd time.Time) HTTPTimings {
	total := int(time.Since(start).Milliseconds())
	download := 0
	if !c.firstByte.IsZero() && !bodyEnd.IsZero() {
		download = int(bodyEnd.Sub(c.firstByte).Milliseconds())
		if download < 0 {
			download = 0
		}
	}
	return HTTPTimings{
		DNSMs:      c.dnsMs,
		TCPMs:      c.tcpMs,
		TLSMs:      c.tlsMs,
		TTFBMs:     c.ttfbMs,
		DownloadMs: download,
		TotalMs:    total,
	}
}

func failOutcomeWithMeta(start time.Time, msg string, meta map[string]interface{}) CheckOutcome {
	if meta == nil {
		meta = map[string]interface{}{}
	}
	return CheckOutcome{IsUp: false, ResponseMs: elapsedMs(start), ErrorMessage: msg, Metadata: meta}
}
