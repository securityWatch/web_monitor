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

export function buildHttpConfigPayload(cfg: HttpMonitorConfig, type: string): HttpMonitorConfig | undefined {
  if (type !== 'http' && type !== 'keyword' && type !== 'ssl') return undefined;
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
