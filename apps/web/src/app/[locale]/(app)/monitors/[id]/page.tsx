'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Pencil } from 'lucide-react';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { formatMs } from '@/lib/utils';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

interface Monitor {
  id: string; name: string; type: string; targetUrl: string; status: string;
  intervalSeconds: number; lastCheckedAt?: string; lastResponseMs?: number;
}
interface Check { id: string; checkedAt: string; isUp: boolean; responseMs?: number; statusCode?: number; errorMessage?: string; }

export default function MonitorDetailPage() {
  const t = useTranslations('monitors');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const auth = getStoredAuth();
  const orgId = auth?.organization.id;
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [trend, setTrend] = useState<{ time: string; avgMs: number }[]>([]);

  useEffect(() => {
    if (!orgId || !id) return;

    const load = () => {
      apiFetch<Monitor>(`/api/v1/orgs/${orgId}/monitors/${id}`).then(setMonitor).catch(console.error);
      apiFetch<{ checks: Check[] }>(`/api/v1/orgs/${orgId}/monitors/${id}/checks`)
        .then((d) => setChecks(d.checks))
        .catch(console.error);
      apiFetch<{ trend: { time: string; avgMs: number }[] }>(`/api/v1/orgs/${orgId}/monitors/${id}/stats`)
        .then((d) => setTrend(d.trend || []))
        .catch(console.error);
    };

    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [orgId, id]);

  if (!monitor) return <div className="text-zinc-500">{tc('loading')}</div>;

  const latestResponseMs = monitor.lastResponseMs ?? checks.find((c) => c.responseMs != null)?.responseMs;
  const chartFromChecks = [...checks]
    .filter((c) => c.responseMs != null)
    .reverse()
    .map((c) => ({
      time: new Date(c.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ms: c.responseMs!,
    }));
  const chartFromStats = trend.map((p) => ({
    time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ms: p.avgMs,
  }));
  const chartData = chartFromChecks.length > 0 ? chartFromChecks : chartFromStats;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{monitor.name}</h1>
          <p className="font-mono text-sm text-zinc-500">{monitor.targetUrl}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/monitors/${id}/edit`} className="btn-secondary flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4" /> {tc('edit')}
          </Link>
          <span className={`badge-${monitor.status === 'up' ? 'up' : monitor.status === 'down' ? 'down' : 'pending'}`}>{monitor.status}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-zinc-500">{tc('type')}</p><p className="mt-1 uppercase">{monitor.type}</p></div>
        <div className="card"><p className="text-sm text-zinc-500">{tc('interval')}</p><p className="mt-1 font-mono">{monitor.intervalSeconds}s</p></div>
        <div className="card"><p className="text-sm text-zinc-500">{t('responseTime')}</p><p className="mt-1 font-mono">{formatMs(latestResponseMs)}</p></div>
      </div>

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
        <h2 className="font-semibold">{t('checkLog')}</h2>
        <div className="mt-4 max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-left text-zinc-500"><th className="pb-2">{tc('lastChecked')}</th><th className="pb-2">{tc('status')}</th><th className="pb-2">ms</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/50">
                  <td className="py-2">{new Date(c.checkedAt).toLocaleString()}</td>
                  <td className="py-2"><span className={c.isUp ? 'badge-up' : 'badge-down'}>{c.isUp ? tc('up') : tc('down')}</span></td>
                  <td className="py-2 font-mono">{formatMs(c.responseMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
