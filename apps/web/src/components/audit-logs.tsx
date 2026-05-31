'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface AuditEntry {
  id: string;
  action: string;
  ip?: string;
  createdAt: string;
  userEmail?: string;
}

export function AuditLogs() {
  const t = useTranslations('settings.audit');
  const orgId = getStoredAuth()?.organization.id;
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    apiFetch<{ logs: AuditEntry[] }>(`/api/v1/orgs/${orgId}/audit-logs`)
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')));
  }, [orgId, t]);

  if (error) {
    return <div className="card text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-sm text-zinc-500">{t('desc')}</p>
      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-4">{t('colTime')}</th>
                <th className="pb-2 pr-4">{t('colAction')}</th>
                <th className="pb-2 pr-4">{t('colUser')}</th>
                <th className="pb-2">{t('colIp')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 text-xs text-zinc-400">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{l.action}</td>
                  <td className="py-2 pr-4 text-xs">{l.userEmail || '—'}</td>
                  <td className="py-2 text-xs text-zinc-500">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
