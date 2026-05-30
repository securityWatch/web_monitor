'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { formatUptime, formatMs } from '@/lib/utils';
import { Plus, Trash2, Pause, Play, Pencil } from 'lucide-react';

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

const ROW_H = 52;
const VIEW_H = 520;

export default function MonitorsPage() {
  const t = useTranslations('monitors');
  const tc = useTranslations('common');
  const auth = getStoredAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const batchAction = async (action: 'pause' | 'resume' | 'delete') => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === 'delete' && !confirm(t('batchDeleteConfirm', { count: ids.length }))) return;
    const orgId = auth!.organization.id;
    const apiAction = action === 'resume' ? 'resume' : action;
    await apiFetch(`/api/v1/orgs/${orgId}/monitors/batch`, {
      method: 'PATCH',
      body: JSON.stringify({ ids, action: apiAction }),
    });
    setSelected(new Set());
    load();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = useMemo(() => {
    const start = Math.floor(scrollTop / ROW_H);
    const count = Math.ceil(VIEW_H / ROW_H) + 2;
    return { start, rows: monitors.slice(start, start + count), padTop: start * ROW_H };
  }, [monitors, scrollTop]);

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
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => batchAction('pause')}>{t('batchPause', { count: selected.size })}</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => batchAction('delete')}>{t('batchDelete', { count: selected.size })}</button>
          </div>
        )}
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
            <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95">
              <tr className="text-left text-zinc-500">
                <th className="w-10 p-4"><span className="sr-only">{t('select')}</span></th>
                <th className="p-4">{tc('status')}</th>
                <th className="p-4">{tc('name')}</th>
                <th className="p-4">{tc('url')}</th>
                <th className="p-4">{tc('type')}</th>
                <th className="p-4">{tc('uptime')}</th>
                <th className="p-4">{tc('lastChecked')}</th>
                <th className="p-4">{tc('actions')}</th>
              </tr>
            </thead>
          </table>
          <div
            ref={scrollRef}
            style={{ height: VIEW_H, overflow: 'auto' }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <table className="w-full text-sm">
              <tbody style={{ height: monitors.length * ROW_H }}>
                <tr style={{ height: visible.padTop }} aria-hidden><td colSpan={8} /></tr>
                {visible.rows.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30" style={{ height: ROW_H }}>
                    <td className="w-10 p-4">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} className="h-4 w-4 rounded border-zinc-600" />
                    </td>
                    <td className="p-4"><span className={`badge-${m.status === 'up' ? 'up' : m.status === 'down' ? 'down' : m.status === 'paused' ? 'paused' : 'pending'}`}>{m.status}</span></td>
                    <td className="p-4"><Link href={`/monitors/${m.id}`} className="font-medium text-blue-400 hover:underline">{m.name}</Link></td>
                    <td className="max-w-[200px] truncate p-4 font-mono text-xs text-zinc-400">{m.targetUrl}</td>
                    <td className="p-4 uppercase text-xs">{m.type}</td>
                    <td className="p-4 font-mono">{formatUptime(m.uptime24h)}</td>
                    <td className="p-4 text-zinc-500">{m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleString() : '—'} {m.lastResponseMs != null && `(${formatMs(m.lastResponseMs)})`}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Link href={`/monitors/${m.id}/edit`} className="text-zinc-400 hover:text-white" title={tc('edit')}><Pencil className="h-4 w-4" /></Link>
                        <button onClick={() => togglePause(m)} className="text-zinc-400 hover:text-white">{m.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
                        <button onClick={() => remove(m.id)} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
