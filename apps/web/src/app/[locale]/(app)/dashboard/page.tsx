'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { formatUptime, greetingKey } from '@/lib/utils';
import { RecentFailuresTicker } from '@/components/recent-failures-ticker';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface DashboardStats {
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
  recentIncidents: { id: string; monitorName: string; startedAt: string; status: string }[];
  recentFailures: {
    monitorId: string;
    monitorName: string;
    checkedAt: string;
    errorMessage?: string | null;
    statusCode?: number | null;
  }[];
  topMonitors: { id: string; name: string; status: string; lastResponseMs?: number; uptime24h?: number }[];
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const auth = getStoredAuth();

  useEffect(() => {
    const orgId = auth?.organization.id;
    if (!orgId) return;
    const load = () => {
      apiFetch<DashboardStats>(`/api/v1/orgs/${orgId}/dashboard`)
        .then(setStats)
        .catch(console.error);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [auth?.organization.id]);

  const hour = new Date().getHours();
  const name = auth?.user.displayName || auth?.user.email?.split('@')[0] || 'User';

  if (!stats) {
    return <div className="text-zinc-500">{tc('loading')}</div>;
  }

  const chartData = stats.responseTimeTrend.map((p) => ({
    time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ms: p.avgMs,
  }));

  const kpiCards = [
    {
      label: t('totalMonitors'),
      value: stats.totalMonitors,
      sub: `${stats.upCount} ${tc('up')} · ${stats.pausedCount} ${t('pausedLabel')}`,
    },
    {
      label: t('downMonitors'),
      value: stats.downCount,
      sub: stats.downCount ? tc('down') : t('allOperational'),
      danger: stats.downCount > 0,
    },
    {
      label: t('openIncidents'),
      value: stats.openIncidents,
      sub: t('incidentSub'),
      danger: stats.openIncidents > 0,
    },
    {
      label: t('errorRate24h'),
      value: formatUptime(stats.errorRate24h),
      sub: t('failedChecksSub', { count: stats.failedChecks24h, total: stats.totalChecks24h }),
      mono: true,
      danger: stats.errorRate24h > 0,
    },
    {
      label: t('uptime24h'),
      value: formatUptime(stats.uptime24h),
      sub: t('checks24hSub', { count: stats.totalChecks24h }),
      mono: true,
    },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <h1 className="text-2xl font-bold">{t(greetingKey(hour), { name })}</h1>

      {stats.downCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t('incidentBanner', { count: stats.downCount })}
          <Link href="/incidents" className="ml-2 underline">→</Link>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-400">{t('recentFailuresTicker')}</p>
        <RecentFailuresTicker items={stats.recentFailures} emptyLabel={t('noRecentFailures')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-zinc-500">{c.label}</p>
            <p className={`mt-2 text-3xl font-bold tabular-nums ${c.danger ? 'text-red-400' : ''} ${c.mono ? 'font-mono' : ''}`}>{c.value}</p>
            {c.sub && <p className="mt-1 text-xs text-zinc-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">{t('responseTime24h')}</h2>
          <div className="mt-4 h-48">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <XAxis dataKey="time" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
                  <Area type="monotone" dataKey="ms" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-zinc-500">{tc('noData')}</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold">{t('activeIncidents')}</h2>
          <div className="mt-4 space-y-3">
            {stats.recentIncidents.length === 0 ? (
              <p className="text-sm text-emerald-400">{t('allOperational')} 🎉</p>
            ) : (
              stats.recentIncidents.slice(0, 5).map((inc) => (
                <div key={inc.id} className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-sm">
                  <span>{inc.monitorName}</span>
                  <span className={inc.status === 'open' ? 'badge-down' : 'badge-up'}>{inc.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold">{t('monitorsGlance')}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="pb-2">{tc('name')}</th>
                <th className="pb-2">{tc('status')}</th>
                <th className="pb-2">{tc('uptime')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.topMonitors.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50">
                  <td className="py-2"><Link href={`/monitors/${m.id}`} className="text-blue-400 hover:underline">{m.name}</Link></td>
                  <td className="py-2"><span className={`badge-${m.status === 'up' ? 'up' : m.status === 'down' ? 'down' : 'paused'}`}>{m.status}</span></td>
                  <td className="py-2 font-mono">{formatUptime(m.uptime24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
