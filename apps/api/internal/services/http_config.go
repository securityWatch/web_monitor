package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

const maxChainSteps = 5
const maxBodyBytes = 65536

type HTTPExtractRule struct {
	Var     string `json:"var"`
	From    string `json:"from"` // json | regex | header
	Path    string `json:"path,omitempty"`
	Pattern string `json:"pattern,omitempty"`
}

type HTTPStep struct {
	Name               string            `json:"name,omitempty"`
	URL                string            `json:"url,omitempty"`
	Method             string            `json:"method,omitempty"`
	Headers            map[string]string `json:"headers,omitempty"`
	Body               string            `json:"body,omitempty"`
	ExpectedStatus     int               `json:"expectedStatus,omitempty"`
	ExpectedStatuses   []int             `json:"expectedStatuses,omitempty"`
	Extract            []HTTPExtractRule `json:"extract,omitempty"`
}

type HTTPMonitorConfig struct {
	Method             string            `json:"method,omitempty"`
	Body               string            `json:"body,omitempty"`
	Headers            map[string]string `json:"headers,omitempty"`
	ExpectedStatus     int               `json:"expectedStatus,omitempty"`
	ExpectedStatuses   []int             `json:"expectedStatuses,omitempty"`
	Keyword            string            `json:"keyword,omitempty"`
	KeywordMustContain bool              `json:"keywordMustContain,omitempty"`
	Timeout            float64           `json:"timeout,omitempty"`
	Steps              []HTTPStep        `json:"steps,omitempty"`
}

func ParseHTTPConfig(raw map[string]interface{}) HTTPMonitorConfig {
	data, _ := json.Marshal(raw)
	var cfg HTTPMonitorConfig
	_ = json.Unmarshal(data, &cfg)
	return cfg
}

func substituteVars(s string, vars map[string]string) string {
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

func validateChainSteps(steps []HTTPStep) error {
	if len(steps) > maxChainSteps {
		return fmt.Errorf("request chain exceeds maximum of %d steps", maxChainSteps)
	}
	for i, step := range steps {
		for _, ex := range step.Extract {
			if ex.Var == "" {
				return fmt.Errorf("step %d: extract var name is required", i+1)
			}
			switch ex.From {
			case "json":
				if ex.Path == "" {
					return fmt.Errorf("step %d: json extract requires path", i+1)
				}
			case "regex":
				if ex.Pattern == "" {
					return fmt.Errorf("step %d: regex extract requires pattern", i+1)
				}
			case "header":
				if ex.Path == "" {
					return fmt.Errorf("step %d: header extract requires path (header name)", i+1)
				}
			default:
				return fmt.Errorf("step %d: unsupported extract type %q", i+1, ex.From)
			}
		}
	}
	return nil
}

func resolveExpectedStatuses(single int, list []int) []int {
	if len(list) > 0 {
		out := make([]int, 0, len(list))
		seen := map[int]bool{}
		for _, code := range list {
			if code < 100 || code > 599 || seen[code] {
				continue
			}
			seen[code] = true
			out = append(out, code)
		}
		if len(out) > 0 {
			return out
		}
	}
	if single >= 100 && single <= 599 {
		return []int{single}
	}
	return []int{200}
}

func expectedStatusesForConfig(cfg HTTPMonitorConfig) []int {
	return resolveExpectedStatuses(cfg.ExpectedStatus, cfg.ExpectedStatuses)
}

func expectedStatusesForStep(step HTTPStep) []int {
	return resolveExpectedStatuses(step.ExpectedStatus, step.ExpectedStatuses)
}

func statusAllowed(code int, allowed []int) bool {
	for _, s := range allowed {
		if code == s {
			return true
		}
	}
	return false
}

func formatExpectedStatuses(allowed []int) string {
	parts := make([]string, len(allowed))
	for i, s := range allowed {
		parts[i] = fmt.Sprintf("%d", s)
	}
	return strings.Join(parts, ", ")
}
