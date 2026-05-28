'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { formatUptime, formatMs } from '@/lib/utils';
import { Plus, Trash2, Pause, Play } from 'lucide-react';

interface Monitor {
  id: string;
  name: string;
  type: string;
  targetUrl: string;
  status: string;
  intervalSeconds: number;
  lastCheckedAt?: string;
  lastResponseMs?: number;
  uptime24h?: number;
}

export default function MonitorsPage() {
  const t = useTranslations('monitors');
  const tc = useTranslations('common');
  const auth = getStoredAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    const orgId = auth?.organization.id;
    if (!orgId) return;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    apiFetch<{ monitors: Monitor[] }>(`/api/v1/orgs/${orgId}/monitors?${params}`)
      .then((d) => setMonitors(d.monitors))
      .catch(console.error);
  };

  useEffect(() => { load(); }, [auth?.organization.id, search, statusFilter]);

  const togglePause = async (m: Monitor) => {
    const orgId = auth!.organization.id;
    const newStatus = m.status === 'paused' ? 'pending' : 'paused';
    await apiFetch(`/api/v1/orgs/${orgId}/monitors/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) return;
    await apiFetch(`/api/v1/orgs/${auth!.organization.id}/monitors/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-zinc-500">{t('subtitle')}</p>
        </div>
        <Link href="/monitors/new" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> {t('addMonitor')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[140px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{tc('all')}</option>
          <option value="up">{tc('up')}</option>
          <option value="down">{tc('down')}</option>
          <option value="paused">{tc('paused')}</option>
        </select>
      </div>

      {monitors.length === 0 ? (
        <div className="card text-center py-16">
          <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
          <p className="mt-2 text-zinc-500">{t('emptyDesc')}</p>
          <Link href="/monitors/new" className="btn-primary mt-6 inline-block">{t('emptyCta')}</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80">
              <tr className="text-left text-zinc-500">
                <th className="p-4">{tc('status')}</th>
                <th className="p-4">{tc('name')}</th>
                <th className="p-4">{tc('url')}</th>
                <th className="p-4">{tc('type')}</th>
                <th className="p-4">{tc('uptime')}</th>
                <th className="p-4">{tc('lastChecked')}</th>
                <th className="p-4">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                  <td className="p-4"><span className={`badge-${m.status === 'up' ? 'up' : m.status === 'down' ? 'down' : m.status === 'paused' ? 'paused' : 'pending'}`}>{m.status}</span></td>
                  <td className="p-4"><Link href={`/monitors/${m.id}`} className="font-medium text-blue-400 hover:underline">{m.name}</Link></td>
                  <td className="max-w-[200px] truncate p-4 font-mono text-xs text-zinc-400">{m.targetUrl}</td>
                  <td className="p-4 uppercase text-xs">{m.type}</td>
                  <td className="p-4 font-mono">{formatUptime(m.uptime24h)}</td>
                  <td className="p-4 text-zinc-500">{m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleString() : '—'} {m.lastResponseMs != null && `(${formatMs(m.lastResponseMs)})`}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button onClick={() => togglePause(m)} className="text-zinc-400 hover:text-white">{m.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
                      <button onClick={() => remove(m.id)} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
