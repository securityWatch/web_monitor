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
  };
}

export function parseCheckMetadata(raw: unknown): CheckMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    timings: parseTimings(obj.timings),
    responseBodySnippet: typeof obj.responseBodySnippet === 'string' ? obj.responseBodySnippet : undefined,
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
