export interface HttpExtractRule {
  var: string;
  from: 'json' | 'regex' | 'header';
  path?: string;
  pattern?: string;
}

export interface HttpStep {
  name?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number;
  expectedStatuses?: number[];
  extract?: HttpExtractRule[];
}

export interface JSONAssertion {
  path: string;
  operator: 'eq' | 'ne' | 'contains' | 'exists';
  value?: string;
}

export interface HttpMonitorConfig {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  expectedStatus?: number;
  expectedStatuses?: number[];
  keyword?: string;
  keywordMustContain?: boolean;
  jsonAssertions?: JSONAssertion[];
  timeout?: number;
  steps?: HttpStep[];
}

export const defaultHttpConfig = (): HttpMonitorConfig => ({
  method: 'GET',
  body: '',
  headers: {},
  expectedStatuses: [200],
  steps: [],
});

export const emptyHttpStep = (): HttpStep => ({
  name: '',
  url: '',
  method: 'GET',
  body: '',
  headers: {},
  expectedStatuses: [200],
  extract: [],
});

export const emptyJsonAssertion = (): JSONAssertion => ({ path: '', operator: 'eq', value: '' });

export const emptyExtractRule = (): HttpExtractRule => ({
  var: '',
  from: 'json',
  path: '',
});

export function parseExpectedStatusesInput(input: string): number[] {
  const codes = input
    .split(/[,，\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 100 && n <= 599);
  const unique = [...new Set(codes)];
  return unique.length > 0 ? unique : [200];
}

export function formatExpectedStatusesInput(statuses?: number[], fallback?: number): string {
  if (statuses && statuses.length > 0) return statuses.join(', ');
  if (fallback && fallback > 0) return String(fallback);
  return '200';
}

export function resolveExpectedStatusesList(cfg: { expectedStatus?: number; expectedStatuses?: number[] }): number[] {
  if (cfg.expectedStatuses && cfg.expectedStatuses.length > 0) return cfg.expectedStatuses;
  if (cfg.expectedStatus && cfg.expectedStatus > 0) return [cfg.expectedStatus];
  return [200];
}

export function parseHttpConfig(raw: unknown): HttpMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultHttpConfig();
  const obj = raw as Record<string, unknown>;
  const expectedStatuses = Array.isArray(obj.expectedStatuses)
    ? (obj.expectedStatuses as number[]).filter((n) => typeof n === 'number')
    : undefined;
  return {
    method: typeof obj.method === 'string' ? obj.method : 'GET',
    body: typeof obj.body === 'string' ? obj.body : '',
    headers: (obj.headers as Record<string, string>) || {},
    expectedStatus: typeof obj.expectedStatus === 'number' ? obj.expectedStatus : undefined,
    expectedStatuses: expectedStatuses?.length ? expectedStatuses : resolveExpectedStatusesList({ expectedStatus: obj.expectedStatus as number | undefined }),
    keyword: typeof obj.keyword === 'string' ? obj.keyword : undefined,
    keywordMustContain: typeof obj.keywordMustContain === 'boolean' ? obj.keywordMustContain : undefined,
    jsonAssertions: Array.isArray(obj.jsonAssertions) ? (obj.jsonAssertions as JSONAssertion[]) : [],
    timeout: typeof obj.timeout === 'number' ? obj.timeout : undefined,
    steps: Array.isArray(obj.steps)
      ? (obj.steps as HttpStep[]).map((s) => ({
          ...s,
          expectedStatuses: s.expectedStatuses?.length
            ? s.expectedStatuses
            : resolveExpectedStatusesList({ expectedStatus: s.expectedStatus }),
        }))
      : [],
  };
}

export interface MonitorAlertConfig {
  webhookEnabled: boolean;
}

export interface SslMonitorConfig {
  warnDays?: number;
}

export interface DnsMonitorConfig {
  recordType?: string;
  baselineMode?: 'auto' | 'manual';
  expectedValue?: string;
  trustedResolvers?: string;
}

export interface TamperMonitorConfig {
  changeThresholdPercent?: number;
  detectMajorChange?: boolean;
  policyCategories?: { gambling?: boolean; adult?: boolean };
  customBlocklist?: string;
  contentScanConsent?: boolean;
}

export interface PageSpeedMonitorConfig {
  maxTtfbMs?: number;
  maxLcpMs?: number;
  maxTotalMs?: number;
  maxPageWeightKb?: number;
}

export const defaultSslConfig = (): SslMonitorConfig => ({ warnDays: 30 });
export const defaultDnsConfig = (): DnsMonitorConfig => ({ recordType: 'A', baselineMode: 'auto' });
export const defaultTamperConfig = (): TamperMonitorConfig => ({
  changeThresholdPercent: 10,
  detectMajorChange: true,
  policyCategories: {},
});
export const defaultPageSpeedConfig = (): PageSpeedMonitorConfig => ({
  maxTtfbMs: 2000,
  maxLcpMs: 2500,
  maxTotalMs: 5000,
  maxPageWeightKb: 2048,
});

export const defaultAlertConfig = (): MonitorAlertConfig => ({ webhookEnabled: true });

export function parseSslConfig(raw: unknown): SslMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultSslConfig();
  const obj = raw as Record<string, unknown>;
  return { warnDays: typeof obj.warnDays === 'number' ? obj.warnDays : 30 };
}

export function parseDnsConfig(raw: unknown): DnsMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultDnsConfig();
  const obj = raw as Record<string, unknown>;
  const resolvers = Array.isArray(obj.trustedResolvers)
    ? (obj.trustedResolvers as string[]).join(', ')
    : typeof obj.trustedResolvers === 'string'
      ? obj.trustedResolvers
      : '';
  return {
    recordType: typeof obj.recordType === 'string' ? obj.recordType : 'A',
    baselineMode: obj.baselineMode === 'manual' ? 'manual' : 'auto',
    expectedValue: typeof obj.expectedValue === 'string' ? obj.expectedValue : '',
    trustedResolvers: resolvers,
  };
}

export function parseTamperConfig(raw: unknown): TamperMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultTamperConfig();
  const obj = raw as Record<string, unknown>;
  const pc = obj.policyCategories as Record<string, boolean> | undefined;
  const blocklist = Array.isArray(obj.customBlocklist)
    ? (obj.customBlocklist as string[]).join('\n')
    : typeof obj.customBlocklist === 'string'
      ? obj.customBlocklist
      : '';
  return {
    changeThresholdPercent: typeof obj.changeThresholdPercent === 'number' ? obj.changeThresholdPercent : 10,
    detectMajorChange: obj.detectMajorChange !== false,
    policyCategories: pc || {},
    customBlocklist: blocklist,
    contentScanConsent: obj.contentScanConsent === true,
  };
}

export function parsePageSpeedConfig(raw: unknown): PageSpeedMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultPageSpeedConfig();
  const obj = raw as Record<string, unknown>;
  return {
    maxTtfbMs: typeof obj.maxTtfbMs === 'number' ? obj.maxTtfbMs : 2000,
    maxLcpMs: typeof obj.maxLcpMs === 'number' ? obj.maxLcpMs : 2500,
    maxTotalMs: typeof obj.maxTotalMs === 'number' ? obj.maxTotalMs : 5000,
    maxPageWeightKb: typeof obj.maxPageWeightKb === 'number' ? obj.maxPageWeightKb : 2048,
  };
}

export function parseAlertConfig(raw: unknown): MonitorAlertConfig {
  if (!raw || typeof raw !== 'object') return defaultAlertConfig();
  const obj = raw as Record<string, unknown>;
  const alerts = obj.alerts;
  if (!alerts || typeof alerts !== 'object') return defaultAlertConfig();
  const a = alerts as Record<string, unknown>;
  return {
    webhookEnabled: typeof a.webhookEnabled === 'boolean' ? a.webhookEnabled : true,
  };
}

export function mergeMonitorConfigForSave(
  existingRaw: unknown,
  httpPayload: HttpMonitorConfig | undefined,
  alertConfig: MonitorAlertConfig,
  security?: {
    ssl?: SslMonitorConfig;
    dns?: DnsMonitorConfig;
    tamper?: TamperMonitorConfig;
    pagespeed?: PageSpeedMonitorConfig;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};

  if (httpPayload) {
    Object.assign(base, httpPayload);
  }

  if (security?.ssl?.warnDays) {
    base.warnDays = security.ssl.warnDays;
  }

  if (security?.dns) {
    const d = security.dns;
    if (d.recordType) base.recordType = d.recordType;
    if (d.baselineMode) base.baselineMode = d.baselineMode;
    if (d.expectedValue?.trim()) base.expectedValue = d.expectedValue.trim();
    else delete base.expectedValue;
    const resolvers = (d.trustedResolvers || '')
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (resolvers.length > 0) base.trustedResolvers = resolvers;
    else delete base.trustedResolvers;
  }

  if (security?.tamper) {
    const tm = security.tamper;
    if (tm.changeThresholdPercent != null) base.changeThresholdPercent = tm.changeThresholdPercent;
    base.detectMajorChange = tm.detectMajorChange !== false;
    base.policyCategories = tm.policyCategories || {};
    base.contentScanConsent = !!tm.contentScanConsent;
    const keywords = (tm.customBlocklist || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length > 0) base.customBlocklist = keywords;
    else delete base.customBlocklist;
  }

  if (security?.pagespeed) {
    const ps = security.pagespeed;
    if (ps.maxTtfbMs != null) base.maxTtfbMs = ps.maxTtfbMs;
    if (ps.maxLcpMs != null) base.maxLcpMs = ps.maxLcpMs;
    if (ps.maxTotalMs != null) base.maxTotalMs = ps.maxTotalMs;
    if (ps.maxPageWeightKb != null) base.maxPageWeightKb = ps.maxPageWeightKb;
  }

  base.alerts = { webhookEnabled: alertConfig.webhookEnabled };
  return base;
}

export function buildHttpConfigPayload(cfg: HttpMonitorConfig, type: string): HttpMonitorConfig | undefined {
  if (type !== 'http' && type !== 'keyword' && type !== 'ssl' && type !== 'api_json') return undefined;
  const statuses = resolveExpectedStatusesList(cfg);
  const payload: HttpMonitorConfig = {
    method: cfg.method || 'GET',
    expectedStatuses: statuses,
  };
  if (statuses.length === 1) payload.expectedStatus = statuses[0];
  if (cfg.body?.trim()) payload.body = cfg.body;
  if (cfg.headers && Object.keys(cfg.headers).length > 0) payload.headers = cfg.headers;
  if (type === 'keyword' && cfg.keyword) {
    payload.keyword = cfg.keyword;
    payload.keywordMustContain = cfg.keywordMustContain ?? true;
  }
  if (cfg.jsonAssertions && cfg.jsonAssertions.length > 0) {
    payload.jsonAssertions = cfg.jsonAssertions.filter((a) => a.path.trim());
  }
  if (cfg.steps && cfg.steps.length > 0) {
    payload.steps = cfg.steps.map((s) => {
      const stepStatuses = resolveExpectedStatusesList(s);
      return {
        ...s,
        expectedStatuses: stepStatuses,
        expectedStatus: stepStatuses.length === 1 ? stepStatuses[0] : undefined,
        extract: (s.extract || []).filter((e) => e.var.trim()),
      };
    });
  }
  return payload;
}
