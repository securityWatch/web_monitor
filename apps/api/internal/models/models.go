package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	Phone           *string    `json:"phone,omitempty"`
	DisplayName     *string    `json:"displayName"`
	AvatarURL       *string    `json:"avatarUrl"`
	Timezone        string     `json:"timezone"`
	Locale          string     `json:"locale"`
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt"`
	NotifyIncidents bool       `json:"notifyIncidents"`
	NotifyDaily     bool       `json:"notifyDaily"`
	NotifyWeekly    bool       `json:"notifyWeekly"`
	NotifyProduct   bool       `json:"notifyProduct"`
	NotifySSL       bool       `json:"notifySsl"`
	IsAdmin         bool       `json:"isAdmin"`
	OnboardingDone  bool       `json:"onboardingDone"`
	CreatedAt       time.Time  `json:"createdAt"`
}

type Organization struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	PlanTier       string `json:"planTier"`
	MonitorQuota   int    `json:"monitorQuota"`
	SeatQuota      int    `json:"seatQuota"`
	FoundingMember bool   `json:"foundingMember"`
}

type OrgMember struct {
	UserID string `json:"userId"`
	OrgID  string `json:"orgId"`
	Role   string `json:"role"`
}

type Monitor struct {
	ID               string          `json:"id"`
	OrgID            string          `json:"orgId"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	TargetURL        string          `json:"targetUrl"`
	IntervalSeconds  int             `json:"intervalSeconds"`
	Status           string          `json:"status"`
	Config           json.RawMessage `json:"config"`
	Regions          json.RawMessage `json:"regions"`
	LastCheckedAt    *time.Time      `json:"lastCheckedAt"`
	LastResponseMs   *int            `json:"lastResponseMs"`
	HeartbeatToken   *string         `json:"heartbeatToken,omitempty"`
	PublicBadgeToken *string         `json:"publicBadgeToken,omitempty"`
	Uptime24h        *float64        `json:"uptime24h,omitempty"`
	Uptime7d         *float64        `json:"uptime7d,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
}

type CheckResult struct {
	ID           string          `json:"id"`
	MonitorID    string          `json:"monitorId"`
	CheckedAt    time.Time       `json:"checkedAt"`
	Region       string          `json:"region"`
	StatusCode   *int            `json:"statusCode"`
	ResponseMs   *int            `json:"responseMs"`
	IsUp         bool            `json:"isUp"`
	ErrorMessage *string         `json:"errorMessage"`
	Metadata     json.RawMessage `json:"metadata"`
}

type Incident struct {
	ID             string     `json:"id"`
	OrgID          string     `json:"orgId"`
	MonitorID      string     `json:"monitorId"`
	MonitorName    string     `json:"monitorName,omitempty"`
	Title          string     `json:"title,omitempty"`
	StartedAt      time.Time  `json:"startedAt"`
	ResolvedAt     *time.Time `json:"resolvedAt"`
	Status         string     `json:"status"`
	WorkflowStatus string     `json:"workflowStatus,omitempty"`
	Severity       string     `json:"severity"`
	Message        *string    `json:"message"`
	AssigneeID     *string    `json:"assigneeId,omitempty"`
	PostMortem     *string    `json:"postMortem,omitempty"`
}

type DashboardStats struct {
	TotalMonitors     int                    `json:"totalMonitors"`
	UpCount           int                    `json:"upCount"`
	DownCount         int                    `json:"downCount"`
	PausedCount       int                    `json:"pausedCount"`
	Uptime24h         float64                `json:"uptime24h"`
	ErrorRate24h      float64                `json:"errorRate24h"`
	FailedChecks24h   int                    `json:"failedChecks24h"`
	TotalChecks24h    int                    `json:"totalChecks24h"`
	OpenIncidents     int                    `json:"openIncidents"`
	ResponseTimeTrend []ResponseTimePoint    `json:"responseTimeTrend"`
	RecentIncidents   []Incident             `json:"recentIncidents"`
	RecentFailures    []RecentFailure        `json:"recentFailures"`
	TopMonitors       []Monitor              `json:"topMonitors"`
}

type RecentFailure struct {
	MonitorID    string     `json:"monitorId"`
	MonitorName  string     `json:"monitorName"`
	CheckedAt    time.Time  `json:"checkedAt"`
	ErrorMessage *string    `json:"errorMessage"`
	StatusCode   *int       `json:"statusCode"`
}

type CheckPagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

type MonitorStatsSummary struct {
	UptimePct   float64 `json:"uptimePct"`
	TotalChecks int     `json:"totalChecks"`
	DownChecks  int     `json:"downChecks"`
	ErrorRate   float64 `json:"errorRate"`
}

type AlertChannel struct {
	ID         string          `json:"id"`
	OrgID      string          `json:"orgId"`
	Name       string          `json:"name"`
	Type       string          `json:"type"`
	Config     json.RawMessage `json:"config"`
	Enabled    bool            `json:"enabled"`
	EventTypes []string        `json:"eventTypes,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
}

type StatusPage struct {
	ID           string    `json:"id"`
	OrgID        string    `json:"orgId"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	IsPublic     bool      `json:"isPublic"`
	CustomDomain *string   `json:"customDomain,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type StatusPageDetail struct {
	StatusPage
	MonitorIDs []string `json:"monitorIds"`
}

type StatusPageComponent struct {
	MonitorID string  `json:"monitorId"`
	Name      string  `json:"name"`
	Status    string  `json:"status"`
	TargetURL string  `json:"targetUrl"`
	Uptime24h float64 `json:"uptime24h"`
}

type ResponseTimePoint struct {
	Time   string  `json:"time"`
	AvgMs  float64 `json:"avgMs"`
	P95Ms  float64 `json:"p95Ms"`
}

type AuthResponse struct {
	AccessToken  string       `json:"accessToken,omitempty"`
	RefreshToken string       `json:"refreshToken,omitempty"`
	User         User         `json:"user,omitempty"`
	Organization Organization `json:"organization,omitempty"`
	RequiresTotp bool         `json:"requiresTotp,omitempty"`
	TempToken    string       `json:"tempToken,omitempty"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}
