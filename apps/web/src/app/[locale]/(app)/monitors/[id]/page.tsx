'use client';



import { useCallback, useEffect, useState, Fragment } from 'react';

import { useTranslations } from 'next-intl';

import { useParams } from 'next/navigation';

import { Link } from '@/i18n/navigation';

import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Search } from 'lucide-react';

import { apiFetch, getStoredAuth } from '@/lib/api';

import { parseCheckMetadata, parseSecurityMetadata } from '@/lib/check-metadata';

import { MonitorSecurityStatus } from '@/components/monitor-security-status';
import { PageSpeedInsights } from '@/components/page-speed-insights';

import { TimingBreakdown } from '@/components/check-timing-breakdown';

import { formatMs, formatUptime } from '@/lib/utils';
import { parseAlertConfig } from '@/lib/monitor-config';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';



type TimeRange = '1h' | '24h' | '7d' | '30d';



interface Monitor {

  id: string; name: string; type: string; targetUrl: string; status: string;

  intervalSeconds: number; lastCheckedAt?: string; lastResponseMs?: number;

  config?: unknown;

}

interface Check {

  id: string; checkedAt: string; isUp: boolean; responseMs?: number;

  statusCode?: number; errorMessage?: string; metadata?: unknown;

}

interface Artifact {
  id: string;
  checkId?: string | null;
  kind: string;
  url: string;
  contentType?: string;
  createdAt: string;
  expiresAt?: string;
}

interface Pagination {

  page: number; pageSize: number; total: number; totalPages: number;

}

interface StatsSummary {

  uptimePct: number; totalChecks: number; downChecks: number; errorRate: number;

}



const PAGE_SIZE = 200;

const RANGES: TimeRange[] = ['1h', '24h', '7d', '30d'];



export default function MonitorDetailPage() {

  const t = useTranslations('monitors');

  const tc = useTranslations('common');

  const { id } = useParams<{ id: string }>();

  const auth = getStoredAuth();

  const orgId = auth?.organization.id;



  const [monitor, setMonitor] = useState<Monitor | null>(null);

  const [latestCheck, setLatestCheck] = useState<Check | null>(null);

  const [checks, setChecks] = useState<Check[]>([]);

  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });

  const [trend, setTrend] = useState<{ time: string; avgMs: number }[]>([]);

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const [range, setRange] = useState<TimeRange>('24h');

  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState('');

  const [search, setSearch] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiVisualLoading, setAiVisualLoading] = useState(false);
  const [aiVisual, setAiVisual] = useState('');



  useEffect(() => {

    const timer = setTimeout(() => {

      setSearch(searchInput.trim());

      setPage(1);

    }, 300);

    return () => clearTimeout(timer);

  }, [searchInput]);



  useEffect(() => {

    if (!orgId || !id) return;

    const loadMonitor = () => {

      apiFetch<Monitor>(`/api/v1/orgs/${orgId}/monitors/${id}`).then(setMonitor).catch(console.error);

      apiFetch<{ checks: Check[] }>(`/api/v1/orgs/${orgId}/monitors/${id}/checks?range=24h&limit=1`)

        .then((d) => setLatestCheck(d.checks[0] || null))

        .catch(console.error);

      apiFetch<{ artifacts: Artifact[] }>(`/api/v1/orgs/${orgId}/monitors/${id}/artifacts`)

        .then((d) => setArtifacts(d.artifacts || []))

        .catch(console.error);

    };

    loadMonitor();

    const iv = setInterval(loadMonitor, 15000);

    return () => clearInterval(iv);

  }, [orgId, id]);

  const loadChecks = useCallback(() => {

    if (!orgId || !id) return;

    const params = new URLSearchParams({

      range,

      page: String(page),

      limit: String(PAGE_SIZE),

    });

    if (search) params.set('search', search);

    apiFetch<{ checks: Check[]; pagination: Pagination }>(

      `/api/v1/orgs/${orgId}/monitors/${id}/checks?${params}`,

    )

      .then((d) => {

        setChecks(d.checks);

        setPagination(d.pagination);

      })

      .catch(console.error);

  }, [orgId, id, range, page, search]);



  const loadStats = useCallback(() => {

    if (!orgId || !id) return;

    apiFetch<{ trend: { time: string; avgMs: number }[]; summary: StatsSummary }>(

      `/api/v1/orgs/${orgId}/monitors/${id}/stats?range=${range}`,

    )

      .then((d) => {

        setTrend(d.trend || []);

        setSummary(d.summary || null);

      })

      .catch(console.error);

  }, [orgId, id, range]);

  const explainVisual = async () => {
    if (!orgId || !id) return;
    setAiVisualLoading(true);
    try {
      const res = await apiFetch<{
        explanation: { summary?: string; visualRisk?: string; evidence?: string[]; nextActions?: string[] };
      }>(`/api/v1/orgs/${orgId}/monitors/${id}/ai-visual`, { method: 'POST' });
      const e = res.explanation;
      setAiVisual([
        e.summary,
        e.visualRisk ? `${t('aiVisualRisk')}: ${e.visualRisk}` : '',
        e.evidence?.length ? `${t('aiVisualEvidence')}: ${e.evidence.join('; ')}` : '',
        e.nextActions?.length ? `${t('aiVisualNext')}: ${e.nextActions.join('; ')}` : '',
      ].filter(Boolean).join('\n'));
    } catch (err) {
      setAiVisual(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiVisualLoading(false);
    }
  };



  useEffect(() => {

    loadChecks();

  }, [loadChecks]);



  useEffect(() => {

    loadStats();

  }, [loadStats]);



  if (!monitor) return <div className="text-zinc-500">{tc('loading')}</div>;



  const latestMeta = parseCheckMetadata(latestCheck?.metadata);
  const securityMeta = parseSecurityMetadata(latestCheck?.metadata);

  const latestResponseMs = monitor.lastResponseMs ?? latestCheck?.responseMs;

  const chartData = trend.map((p) => ({

    time: formatChartTime(p.time, range),

    ms: p.avgMs,

  }));

  const webhookDisabled = !parseAlertConfig(monitor.config).webhookEnabled;
  const artifactByCheck = new Map(artifacts.filter((a) => a.checkId).map((a) => [a.checkId as string, a]));
  const latestArtifact = artifacts[0];



  return (

    <div className="mx-auto max-w-[1600px] space-y-6">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <h1 className="text-2xl font-bold">{monitor.name}</h1>

          <p className="font-mono text-sm text-zinc-500">{monitor.targetUrl}</p>

          {webhookDisabled && (
            <span className="mt-2 inline-block rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-400">
              {t('webhookAlertsDisabledBadge')}
            </span>
          )}

        </div>

        <div className="flex items-center gap-3">

          <Link href={`/monitors/${id}/edit`} className="btn-secondary flex items-center gap-2 text-sm">

            <Pencil className="h-4 w-4" /> {tc('edit')}

          </Link>

          <span className={`badge-${monitor.status === 'up' ? 'up' : monitor.status === 'down' ? 'down' : 'pending'}`}>{monitor.status}</span>

        </div>

      </div>



      <div className="flex flex-wrap items-center gap-2">

        <span className="text-sm text-zinc-500">{t('timeRange')}:</span>

        {RANGES.map((r) => (

          <button

            key={r}

            type="button"

            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${range === r ? 'bg-blue-600 text-white' : 'border border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}

            onClick={() => { setRange(r); setPage(1); }}

          >

            {t(`range${r}` as 'range1h')}

          </button>

        ))}

      </div>



      {latestCheck && !latestCheck.isUp && latestCheck.errorMessage && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <p className="font-medium">{t('lastError')}</p>
          <p className="mt-1 font-mono text-xs">{latestCheck.errorMessage}</p>
          {latestMeta.responseBodySnippet && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs text-zinc-300">{latestMeta.responseBodySnippet}</pre>
          )}
          {latestArtifact && (
            <a href={latestArtifact.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-blue-300 hover:text-blue-200">
              {t('viewLatestArtifact')}
            </a>
          )}
        </div>
      )}



      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

        <div className="card"><p className="text-sm text-zinc-500">{tc('type')}</p><p className="mt-1 uppercase">{monitor.type}</p></div>

        <div className="card"><p className="text-sm text-zinc-500">{tc('interval')}</p><p className="mt-1 font-mono">{monitor.intervalSeconds}s</p></div>

        <div className="card"><p className="text-sm text-zinc-500">{t('responseTime')}</p><p className="mt-1 font-mono">{formatMs(latestResponseMs)}</p></div>

        <div className="card"><p className="text-sm text-zinc-500">{t('rangeUptime')}</p><p className="mt-1 font-mono">{formatUptime(summary?.uptimePct ?? 100)}</p></div>

        <div className="card"><p className="text-sm text-zinc-500">{t('rangeErrorRate')}</p><p className={`mt-1 font-mono ${(summary?.errorRate ?? 0) > 0 ? 'text-red-400' : ''}`}>{formatUptime(summary?.errorRate ?? 0)}</p></div>

      </div>



      <MonitorSecurityStatus type={monitor.type} meta={securityMeta} />

      <PageSpeedInsights meta={latestMeta} />

      {(monitor.type === 'tamper' || securityMeta.aiContentRecognition || securityMeta.diffSummary) && (
        <div className="card space-y-3 border-blue-500/20 bg-blue-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-blue-100">{t('aiVisualTitle')}</h2>
              <p className="text-xs text-blue-100/60">{t('aiVisualDesc')}</p>
            </div>
            <button type="button" className="btn-secondary text-sm" disabled={aiVisualLoading} onClick={explainVisual}>
              {aiVisualLoading ? '...' : t('aiVisualGenerate')}
            </button>
          </div>
          {aiVisual && <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs text-blue-100/80">{aiVisual}</pre>}
        </div>
      )}


      {(artifacts.length > 0 || (latestCheck && !latestCheck.isUp && latestMeta.responseBodySnippet)) && (
        <div className="card">
          <h2 className="font-semibold">{t('forensicsTitle')}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t('forensicsDesc')}</p>
          {artifacts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4">
              {artifacts.slice(0, 5).map((a) => {
                if (a.kind === 'http_capture' && a.url.startsWith('data:application/json')) {
                  try {
                    const raw = atob(a.url.split(',')[1] || '');
                    const meta = JSON.parse(raw) as { statusCode?: number; bodySnippet?: string };
                    return (
                      <div key={a.id} className="max-w-xl rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">
                        <p className="font-medium text-zinc-300">{t('forensicsHttpCapture')}</p>
                        {meta.statusCode != null && <p className="mt-1">HTTP {meta.statusCode}</p>}
                        {meta.bodySnippet && (
                          <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-zinc-300">{meta.bodySnippet}</pre>
                        )}
                      </div>
                    );
                  } catch {
                    return null;
                  }
                }
                if (a.kind !== 'screenshot') return null;
                return (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block max-w-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={t('forensicsScreenshot')} className="rounded-lg border border-zinc-800" />
                  </a>
                );
              })}
            </div>
          )}
          {latestMeta.responseBodySnippet && (
            <pre className="mt-4 max-h-48 overflow-auto rounded bg-black/30 p-3 text-xs text-zinc-300">{latestMeta.responseBodySnippet}</pre>
          )}
        </div>
      )}

      {latestMeta.timings && (

        <div className="card">

          <h2 className="font-semibold">{t('timingBreakdown')}</h2>

          <p className="mt-1 text-xs text-zinc-500">{t('timingBreakdownDesc')}</p>

          <div className="mt-4 max-w-xl">

            <TimingBreakdown timings={latestMeta.timings} />

          </div>

          {latestMeta.chainStepDetails && latestMeta.chainStepDetails.length > 0 && (

            <div className="mt-6 space-y-4 border-t border-zinc-800 pt-4">

              <p className="text-sm font-medium text-zinc-400">{t('chainStepTimings')}</p>

              {latestMeta.chainStepDetails.map((step, i) => (

                <div key={i} className="rounded-lg border border-zinc-800 p-3">

                  <p className="text-sm font-medium">{step.name || t('chainStep', { n: i + 1 })}</p>

                  {step.error && <p className="mt-1 text-xs text-red-400">{step.error}</p>}

                  <div className="mt-2"><TimingBreakdown timings={step.timings} compact /></div>

                </div>

              ))}

            </div>

          )}

        </div>

      )}



      <div className="card">

        <h2 className="font-semibold">{t('responseTime')}</h2>

        <div className="mt-4 h-48">

          {chartData.length > 0 ? (

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={chartData}>

                <XAxis dataKey="time" stroke="#71717a" fontSize={11} />

                <YAxis stroke="#71717a" fontSize={11} />

                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />

                <Line type="monotone" dataKey="ms" stroke="#3b82f6" dot={false} />

              </LineChart>

            </ResponsiveContainer>

          ) : <p className="text-sm text-zinc-500">{tc('noData')}</p>}

        </div>

      </div>



      <div className="card">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <h2 className="font-semibold">{t('checkLog')}</h2>

          <div className="relative w-full max-w-sm">

            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

            <input

              className="input pl-9"

              placeholder={t('checkSearchPlaceholder')}

              value={searchInput}

              onChange={(e) => setSearchInput(e.target.value)}

            />

          </div>

        </div>

        <p className="mt-2 text-xs text-zinc-500">

          {t('checkLogMeta', { total: pagination.total, page: pagination.page, totalPages: pagination.totalPages })}

        </p>

        <div className="mt-4 overflow-x-auto">

          <table className="w-full text-sm">

            <thead>

              <tr className="border-b border-zinc-800 text-left text-zinc-500">

                <th className="w-8 pb-2" />

                <th className="pb-2">{tc('lastChecked')}</th>

                <th className="pb-2">{tc('status')}</th>

                <th className="pb-2">{t('timingTotal')}</th>

                <th className="pb-2">{t('errorDetail')}</th>

              </tr>

            </thead>

            <tbody>

              {checks.length === 0 ? (

                <tr><td colSpan={5} className="py-8 text-center text-zinc-500">{tc('noData')}</td></tr>

              ) : checks.map((c) => {

                const meta = parseCheckMetadata(c.metadata);

                const open = expandedId === c.id;

                const artifact = artifactByCheck.get(c.id);
                const hasDetail = timingRowsCount(meta) > 0 || (meta.chainStepDetails?.length || 0) > 0
                  || !!meta.responseBodySnippet || !c.isUp || !!artifact;

                return (

                  <Fragment key={c.id}>

                    <tr className="border-b border-zinc-800/50">

                      <td className="py-2">

                        {hasDetail ? (

                          <button type="button" onClick={() => setExpandedId(open ? null : c.id)} className="text-zinc-500 hover:text-white">

                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}

                          </button>

                        ) : null}

                      </td>

                      <td className="py-2">{new Date(c.checkedAt).toLocaleString()}</td>

                      <td className="py-2">

                        <span className={c.isUp ? 'badge-up' : 'badge-down'}>{c.isUp ? tc('up') : tc('down')}</span>

                        {c.statusCode != null && <span className="ml-2 font-mono text-xs text-zinc-500">{c.statusCode}</span>}

                      </td>

                      <td className="py-2 font-mono">{formatMs(c.responseMs ?? meta.timings?.totalMs)}</td>

                      <td className="max-w-xs truncate py-2 text-xs text-red-400">{c.errorMessage || '—'}</td>

                    </tr>

                    {open && hasDetail && (

                      <tr className="border-b border-zinc-800/50 bg-zinc-900/40">

                        <td colSpan={5} className="px-4 py-3">
                          {!c.isUp && (
                            <p className="mb-2 text-xs font-medium text-zinc-400">{t('forensicsTab')}</p>
                          )}
                          {meta.responseBodySnippet && (
                            <pre className="mb-3 max-h-36 overflow-auto rounded bg-black/30 p-2 text-xs text-zinc-300">{meta.responseBodySnippet}</pre>
                          )}

                          {meta.timings && (

                            <div className="max-w-xl">

                              <TimingBreakdown timings={meta.timings} compact />

                            </div>

                          )}

                          {meta.chainStepDetails?.map((step, i) => (

                            <div key={i} className="mt-3 rounded border border-zinc-800 p-2">

                              <p className="text-xs font-medium text-zinc-400">{step.name || `Step ${i + 1}`}</p>

                              {step.error && <p className="text-xs text-red-400">{step.error}</p>}

                              <div className="mt-1"><TimingBreakdown timings={step.timings} compact /></div>

                            </div>

                          ))}

                          {artifact && (
                            <div className="mt-4 rounded border border-zinc-800 bg-black/20 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-zinc-400">{t('forensicsArtifact')}</p>
                                <a href={artifact.url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 hover:text-blue-200">
                                  {t('openArtifact')}
                                </a>
                              </div>
                              {artifact.contentType?.startsWith('image/') && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={artifact.url} alt={t('forensicsArtifact')} className="mt-3 max-h-64 rounded border border-zinc-800 object-contain" />
                              )}
                              <p className="mt-2 text-xs text-zinc-500">
                                {t('artifactExpiresAt', { date: artifact.expiresAt ? new Date(artifact.expiresAt).toLocaleString() : '-' })}
                              </p>
                            </div>
                          )}

                        </td>

                      </tr>

                    )}

                  </Fragment>

                );

              })}

            </tbody>

          </table>

        </div>

        {pagination.totalPages > 1 && (

          <div className="mt-4 flex items-center justify-between gap-4">

            <p className="text-sm text-zinc-500">

              {t('pageInfo', { page: pagination.page, totalPages: pagination.totalPages })}

            </p>

            <div className="flex gap-2">

              <button

                type="button"

                className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-40"

                disabled={page <= 1}

                onClick={() => setPage((p) => Math.max(1, p - 1))}

              >

                <ChevronLeft className="h-4 w-4" /> {t('prevPage')}

              </button>

              <button

                type="button"

                className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-40"

                disabled={page >= pagination.totalPages}

                onClick={() => setPage((p) => p + 1)}

              >

                {t('nextPage')} <ChevronRight className="h-4 w-4" />

              </button>

            </div>

          </div>

        )}

      </div>

    </div>

  );

}



function formatChartTime(iso: string, range: TimeRange) {

  const d = new Date(iso);

  if (range === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (range === '7d') return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });

}



function timingRowsCount(meta: ReturnType<typeof parseCheckMetadata>) {

  const t = meta.timings;

  if (!t) return meta.chainStepDetails?.length || 0;

  return [t.dnsMs, t.tcpMs, t.tlsMs, t.ttfbMs, t.downloadMs, t.totalMs].filter((v) => v != null && v > 0).length

    + (meta.chainStepDetails?.length || 0);

}

