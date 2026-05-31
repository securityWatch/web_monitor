'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Shield } from 'lucide-react';

export function TotpSettings() {
  const t = useTranslations('settings.totp');
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ enabled: boolean }>('/api/v1/me/totp').then((d) => setEnabled(d.enabled)).catch(() => {});
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ secret: string; uri: string }>('/api/v1/me/totp/setup', { method: 'POST' });
      setSetup(data);
      setMsg('');
    } catch {
      setMsg(t('setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/v1/me/totp/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setEnabled(true);
      setSetup(null);
      setCode('');
      setMsg(t('enabledMsg'));
    } catch {
      setMsg(t('invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!confirm(t('confirmDisable'))) return;
    await apiFetch('/api/v1/me/totp/disable', { method: 'POST' });
    setEnabled(false);
    setSetup(null);
    setMsg(t('disabledMsg'));
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-blue-500" />
        <h2 className="font-semibold">{t('title')}</h2>
      </div>
      <p className="text-sm text-zinc-400">{t('desc')}</p>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {enabled ? (
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">{t('enabledBadge')}</span>
          <button type="button" onClick={disable} className="btn-secondary text-sm text-red-400">
            {t('disableBtn')}
          </button>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">{t('scanHint')}</p>
          <code className="block break-all rounded bg-zinc-900 p-2 text-xs">{setup.secret}</code>
          <p className="text-xs text-zinc-500 break-all">{setup.uri}</p>
          <input
            className="input"
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
          <button type="button" onClick={enable} disabled={loading || code.length < 6} className="btn-primary">
            {t('confirmEnable')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={startSetup} disabled={loading} className="btn-primary">
          {t('setupBtn')}
        </button>
      )}
    </div>
  );
}
