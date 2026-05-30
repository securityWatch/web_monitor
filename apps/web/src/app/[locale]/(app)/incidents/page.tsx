'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface Incident {
  id: string; monitorName: string; startedAt: string; resolvedAt?: string;
  status: string; message?: string;
}

export default function IncidentsPage() {
  const t = useTranslations('incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tab, setTab] = useState<'all' | 'open' | 'resolved'>('all');
  const auth = getStoredAuth();

  useEffect(() => {
    const orgId = auth?.organization.id;
    if (!orgId) return;
    const status = tab === 'all' ? '' : tab;
    apiFetch<{ incidents: Incident[] }>(`/api/v1/orgs/${orgId}/incidents${status ? `?status=${status}` : ''}`)
      .then((d) => setIncidents(d.incidents)).catch(console.error);
  }, [auth?.organization.id, tab]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
      </div>
      <div className="flex gap-2">
        {(['all', 'open', 'resolved'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm ${tab === k ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'}`}>
            {k === 'all' ? 'All' : t(k)}
          </button>
        ))}
      </div>
      {incidents.length === 0 ? (
        <div className="card py-16 text-center">
          <h2 className="text-lg font-semibold text-emerald-400">{t('emptyTitle')} 🎉</h2>
          <p className="mt-2 text-zinc-500">{t('emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <Link key={inc.id} href={`/incidents/${inc.id}`} className="card flex flex-wrap items-center justify-between gap-4 transition-colors hover:border-zinc-600">
              <div>
                <p className="font-medium">{inc.monitorName}</p>
                <p className="text-sm text-zinc-500">{t('started')}: {new Date(inc.startedAt).toLocaleString()}</p>
                {inc.message && <p className="mt-1 text-sm text-zinc-400">{inc.message}</p>}
              </div>
              <span className={inc.status === 'open' ? 'badge-down' : 'badge-up'}>{inc.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
