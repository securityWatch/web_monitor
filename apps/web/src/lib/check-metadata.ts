export interface CheckTimings {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
  totalMs?: number;
}

export interface ChainStepDetail {
  name?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  error?: string;
  timings?: CheckTimings;
}

export interface CheckMetadata {
  timings?: CheckTimings;
  chainStepDetails?: ChainStepDetail[];
  responseBodySnippet?: string;
  /** Pagespeed monitor — server-side estimates from TTFB/body size */
  pageSpeed?: boolean;
  fcpMs?: number;
  lcpMs?: number;
  ttfbMs?: number;
  performanceScore?: number;
  budgetStatus?: 'pass' | 'fail';
  budgetViolations?: string[];
  pageWeightBytes?: number;
  htmlBytes?: number;
  resourceInventory?: {
    total: number;
    byType: Record<string, number>;
  };
  navigationPhases?: { name: string; durationMs: number }[];
  performanceBudgets?: Record<string, number>;
}

export interface SecurityCheckMetadata {
  sslDaysLeft?: number;
  sslExpiresAt?: string;
  issuer?: string;
  tlsVersion?: string;
  records?: string[];
  recordType?: string;
  dnsChanged?: boolean;
  bodyHash?: string;
  diffPercent?: number;
  diffSummary?: string;
  matchedKeywords?: string[];
  aiContentRecognition?: {
    status?: string;
    flagged?: boolean;
    riskLevel?: string;
    categories?: string[];
    summary?: string;
    confidence?: number;
  };
}

export function parseSecurityMetadata(raw: unknown): SecurityCheckMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const records = Array.isArray(obj.records)
    ? (obj.records as unknown[]).map(String)
    : undefined;
  const matched = Array.isArray(obj.matchedKeywords)
    ? (obj.matchedKeywords as unknown[]).map(String)
    : undefined;
  const aiRaw = obj.aiContentRecognition && typeof obj.aiContentRecognition === 'object'
    ? (obj.aiContentRecognition as Record<string, unknown>)
    : undefined;
  const aiCategories = Array.isArray(aiRaw?.categories)
    ? (aiRaw?.categories as unknown[]).map(String)
    : undefined;
  return {
    sslDaysLeft: typeof obj.sslDaysLeft === 'number' ? obj.sslDaysLeft : undefined,
    sslExpiresAt: typeof obj.sslExpiresAt === 'string' ? obj.sslExpiresAt : undefined,
    issuer: typeof obj.issuer === 'string' ? obj.issuer : undefined,
    tlsVersion: typeof obj.tlsVersion === 'string' ? obj.tlsVersion : undefined,
    records,
    recordType: typeof obj.recordType === 'string' ? obj.recordType : undefined,
    dnsChanged: obj.dnsChanged === true || obj.changed === true,
    bodyHash: typeof obj.bodyHash === 'string' ? obj.bodyHash : undefined,
    diffPercent: typeof obj.diffPercent === 'number' ? obj.diffPercent : undefined,
    diffSummary: typeof obj.diffSummary === 'string' ? obj.diffSummary : undefined,
    matchedKeywords: matched,
    aiContentRecognition: aiRaw
      ? {
          status: typeof aiRaw.status === 'string' ? aiRaw.status : undefined,
          flagged: typeof aiRaw.flagged === 'boolean' ? aiRaw.flagged : undefined,
          riskLevel: typeof aiRaw.riskLevel === 'string' ? aiRaw.riskLevel : undefined,
          categories: aiCategories,
          summary: typeof aiRaw.summary === 'string' ? aiRaw.summary : undefined,
          confidence: typeof aiRaw.confidence === 'number' ? aiRaw.confidence : undefined,
        }
      : undefined,
  };
}

export function parseCheckMetadata(raw: unknown): CheckMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    timings: parseTimings(obj.timings),
    responseBodySnippet: typeof obj.responseBodySnippet === 'string' ? obj.responseBodySnippet : undefined,
    pageSpeed: obj.pageSpeed === true,
    fcpMs: numFromObject(obj, 'fcpMs'),
    lcpMs: numFromObject(obj, 'lcpMs'),
    ttfbMs: numFromObject(obj, 'ttfbMs'),
    performanceScore: numFromObject(obj, 'performanceScore'),
    budgetStatus: obj.budgetStatus === 'fail' ? 'fail' : obj.budgetStatus === 'pass' ? 'pass' : undefined,
    budgetViolations: Array.isArray(obj.budgetViolations) ? obj.budgetViolations.map(String) : undefined,
    pageWeightBytes: numFromObject(obj, 'pageWeightBytes'),
    htmlBytes: numFromObject(obj, 'htmlBytes'),
    resourceInventory: parseResourceInventory(obj.resourceInventory),
    navigationPhases: parseNavigationPhases(obj.navigationPhases),
    performanceBudgets: parseNumberMap(obj.performanceBudgets),
    chainStepDetails: Array.isArray(obj.chainStepDetails)
      ? obj.chainStepDetails.map((s) => {
          const step = s as Record<string, unknown>;
          return {
            name: typeof step.name === 'string' ? step.name : undefined,
            url: typeof step.url === 'string' ? step.url : undefined,
            method: typeof step.method === 'string' ? step.method : undefined,
            statusCode: typeof step.statusCode === 'number' ? step.statusCode : undefined,
            error: typeof step.error === 'string' ? step.error : undefined,
            timings: parseTimings(step.timings),
          };
        })
      : undefined,
  };
}

function numFromObject(obj: Record<string, unknown>, key: string) {
  return typeof obj[key] === 'number' ? (obj[key] as number) : undefined;
}

function parseResourceInventory(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const byTypeRaw = obj.byType && typeof obj.byType === 'object' ? obj.byType as Record<string, unknown> : {};
  const byType: Record<string, number> = {};
  for (const [key, value] of Object.entries(byTypeRaw)) {
    if (typeof value === 'number') byType[key] = value;
  }
  return {
    total: typeof obj.total === 'number' ? obj.total : Object.values(byType).reduce((sum, value) => sum + value, 0),
    byType,
  };
}

function parseNavigationPhases(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        name: typeof obj.name === 'string' ? obj.name : '',
        durationMs: typeof obj.durationMs === 'number' ? obj.durationMs : 0,
      };
    })
    .filter((item) => item.name);
}

function parseNumberMap(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

function parseTimings(raw: unknown): CheckTimings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = raw as Record<string, unknown>;
  const num = (k: string) => (typeof t[k] === 'number' ? (t[k] as number) : undefined);
  return {
    dnsMs: num('dnsMs'),
    tcpMs: num('tcpMs'),
    tlsMs: num('tlsMs'),
    ttfbMs: num('ttfbMs'),
    downloadMs: num('downloadMs'),
    totalMs: num('totalMs'),
  };
}

export const timingRows = (t?: CheckTimings) => {
  if (!t) return [];
  return [
    { key: 'dnsMs', labelKey: 'timingDns' as const, value: t.dnsMs },
    { key: 'tcpMs', labelKey: 'timingTcp' as const, value: t.tcpMs },
    { key: 'tlsMs', labelKey: 'timingTls' as const, value: t.tlsMs },
    { key: 'ttfbMs', labelKey: 'timingTtfb' as const, value: t.ttfbMs },
    { key: 'downloadMs', labelKey: 'timingDownload' as const, value: t.downloadMs },
    { key: 'totalMs', labelKey: 'timingTotal' as const, value: t.totalMs },
  ].filter((r) => r.value != null && r.value > 0);
};
