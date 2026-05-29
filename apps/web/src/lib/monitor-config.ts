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
  extract?: HttpExtractRule[];
}

export interface HttpMonitorConfig {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  expectedStatus?: number;
  keyword?: string;
  keywordMustContain?: boolean;
  timeout?: number;
  steps?: HttpStep[];
}

export const defaultHttpConfig = (): HttpMonitorConfig => ({
  method: 'GET',
  body: '',
  headers: {},
  expectedStatus: 200,
  steps: [],
});

export const emptyHttpStep = (): HttpStep => ({
  name: '',
  url: '',
  method: 'GET',
  body: '',
  headers: {},
  expectedStatus: 200,
  extract: [],
});

export const emptyExtractRule = (): HttpExtractRule => ({
  var: '',
  from: 'json',
  path: '',
});

export function parseHttpConfig(raw: unknown): HttpMonitorConfig {
  if (!raw || typeof raw !== 'object') return defaultHttpConfig();
  const obj = raw as Record<string, unknown>;
  return {
    method: typeof obj.method === 'string' ? obj.method : 'GET',
    body: typeof obj.body === 'string' ? obj.body : '',
    headers: (obj.headers as Record<string, string>) || {},
    expectedStatus: typeof obj.expectedStatus === 'number' ? obj.expectedStatus : 200,
    keyword: typeof obj.keyword === 'string' ? obj.keyword : undefined,
    keywordMustContain: typeof obj.keywordMustContain === 'boolean' ? obj.keywordMustContain : undefined,
    timeout: typeof obj.timeout === 'number' ? obj.timeout : undefined,
    steps: Array.isArray(obj.steps) ? (obj.steps as HttpStep[]) : [],
  };
}

export function buildHttpConfigPayload(cfg: HttpMonitorConfig, type: string): HttpMonitorConfig | undefined {
  if (type !== 'http' && type !== 'keyword' && type !== 'ssl') return undefined;
  const payload: HttpMonitorConfig = {
    method: cfg.method || 'GET',
    expectedStatus: cfg.expectedStatus || 200,
  };
  if (cfg.body?.trim()) payload.body = cfg.body;
  if (cfg.headers && Object.keys(cfg.headers).length > 0) payload.headers = cfg.headers;
  if (type === 'keyword' && cfg.keyword) {
    payload.keyword = cfg.keyword;
    payload.keywordMustContain = cfg.keywordMustContain ?? true;
  }
  if (cfg.steps && cfg.steps.length > 0) {
    payload.steps = cfg.steps.map((s) => ({
      ...s,
      extract: (s.extract || []).filter((e) => e.var.trim()),
    }));
  }
  return payload;
}
