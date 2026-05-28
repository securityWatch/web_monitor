package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	DisplayName     *string    `json:"displayName"`
	AvatarURL       *string    `json:"avatarUrl"`
	Timezone        string     `json:"timezone"`
	Locale          string     `json:"locale"`
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt"`
	NotifyIncidents bool       `json:"notifyIncidents"`
	NotifyWeekly    bool       `json:"notifyWeekly"`
	NotifyProduct   bool       `json:"notifyProduct"`
	NotifySSL       bool       `json:"notifySsl"`
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
	ID          string     `json:"id"`
	OrgID       string     `json:"orgId"`
	MonitorID   string     `json:"monitorId"`
	MonitorName string     `json:"monitorName,omitempty"`
	StartedAt   time.Time  `json:"startedAt"`
	ResolvedAt  *time.Time `json:"resolvedAt"`
	Status      string     `json:"status"`
	Severity    string     `json:"severity"`
	Message     *string    `json:"message"`
}

type DashboardStats struct {
	TotalMonitors     int                    `json:"totalMonitors"`
	UpCount           int                    `json:"upCount"`
	DownCount         int                    `json:"downCount"`
	PausedCount       int                    `json:"pausedCount"`
	Uptime24h         float64                `json:"uptime24h"`
	OpenIncidents     int                    `json:"openIncidents"`
	ResponseTimeTrend []ResponseTimePoint    `json:"responseTimeTrend"`
	RecentIncidents   []Incident             `json:"recentIncidents"`
	TopMonitors       []Monitor              `json:"topMonitors"`
}

type ResponseTimePoint struct {
	Time   string  `json:"time"`
	AvgMs  float64 `json:"avgMs"`
	P95Ms  float64 `json:"p95Ms"`
}

type AuthResponse struct {
	AccessToken  string       `json:"accessToken"`
	RefreshToken string       `json:"refreshToken"`
	User         User         `json:"user"`
	Organization Organization `json:"organization"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}
