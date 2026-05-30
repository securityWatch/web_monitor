'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';

type SessionItem = {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export function SessionSettings() {
  const t = useTranslations('settings.sessions');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = getStoredAuth();
      const q = auth?.refreshToken
        ? `?refreshToken=${encodeURIComponent(auth.refreshToken)}`
        : '';
      const data = await apiFetch<{ sessions: SessionItem[] }>(`/api/v1/me/sessions${q}`);
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    await apiFetch(`/api/v1/me/sessions/${id}`, { method: 'DELETE' });
    setMsg(t('revoked'));
    await load();
  };

  const revokeOthers = async () => {
    const auth = getStoredAuth();
    if (!auth?.refreshToken) return;
    await apiFetch('/api/v1/me/sessions/revoke-others', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    setMsg(t('revokedOthers'));
    await load();
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="text-sm text-zinc-400">{t('desc')}</p>
        </div>
        <button type="button" className="btn-secondary text-sm" onClick={revokeOthers} disabled={loading || sessions.length < 2}>
          {t('revokeOthers')}
        </button>
      </div>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {loading ? (
        <p className="text-sm text-zinc-500">{t('loading')}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">
                  {s.isCurrent ? t('currentDevice') : t('otherDevice')}
                  {s.userAgent && <span className="ml-2 font-normal text-zinc-500">{s.userAgent.slice(0, 80)}</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {s.ipAddress && <span>{s.ipAddress} · </span>}
                  {new Date(s.createdAt).toLocaleString()}
                </p>
              </div>
              {!s.isCurrent && (
                <button type="button" className="btn-secondary text-xs" onClick={() => revoke(s.id)}>
                  {t('revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
