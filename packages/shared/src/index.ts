export type PlanTier = 'free' | 'pro' | 'team' | 'business';
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type MonitorType = 'http' | 'tcp' | 'ping' | 'keyword' | 'ssl' | 'heartbeat' | 'dns' | 'domain' | 'pagespeed' | 'tamper';
export type MonitorStatus = 'up' | 'down' | 'paused' | 'pending';
export type IncidentStatus = 'open' | 'resolved';
export type AlertChannelType = 'email' | 'webhook' | 'slack' | 'discord' | 'teams' | 'pagerduty' | 'dingtalk' | 'feishu' | 'wecom' | 'sms' | 'voice' | 'opsgenie';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  monitorQuota: number;
  seatQuota: number;
  foundingMember: boolean;
}

export interface Monitor {
  id: string;
  orgId: string;
  name: string;
  type: MonitorType;
  targetUrl: string;
  intervalSeconds: number;
  status: MonitorStatus;
  config: Record<string, unknown>;
  regions: string[];
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  uptime24h: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckResult {
  id: string;
  monitorId: string;
  checkedAt: string;
  region: string;
  statusCode: number | null;
  responseMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface Incident {
  id: string;
  monitorId: string;
  monitorName?: string;
  startedAt: string;
  resolvedAt: string | null;
  status: IncidentStatus;
  severity: string;
  message: string | null;
}

export interface DashboardStats {
  totalMonitors: number;
  upCount: number;
  downCount: number;
  pausedCount: number;
  uptime24h: number;
  errorRate24h: number;
  failedChecks24h: number;
  totalChecks24h: number;
  openIncidents: number;
  responseTimeTrend: { time: string; avgMs: number; p95Ms: number }[];
  recentIncidents: Incident[];
  recentFailures: RecentFailure[];
  topMonitors: Monitor[];
}

export interface RecentFailure {
  monitorId: string;
  monitorName: string;
  checkedAt: string;
  errorMessage: string | null;
  statusCode: number | null;
}

export interface CheckPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
  organization: Organization;
}

export const PLAN_LIMITS: Record<PlanTier, { monitors: number; minInterval: number }> = {
  free: { monitors: 15, minInterval: 300 },
  pro: { monitors: 50, minInterval: 60 },
  team: { monitors: 150, minInterval: 60 },
  business: { monitors: 500, minInterval: 30 },
};

export const PLAN_REGION_LIMITS: Record<PlanTier, number> = {
  free: 2,
  pro: 5,
  team: 10,
  business: 20,
};

export const SCREENSHOT_RETENTION_DAYS: Record<PlanTier, number> = {
  free: 0,
  pro: 7,
  team: 30,
  business: 90,
};
