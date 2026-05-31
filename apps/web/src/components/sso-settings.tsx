'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError, getStoredAuth } from '@/lib/api';

interface SsoConfig {
  configured: boolean;
  issuerUrl?: string;
  clientId?: string;
  enabled?: boolean;
}

export function SsoSettings() {
  const t = useTranslations('settings');
  const auth = getStoredAuth();
  const orgId = auth?.organization.id;
  const planTier = auth?.organization.planTier || 'free';
  const orgSlug = auth?.organization.slug || '';
  const canEdit = auth?.organization.role === 'owner' || auth?.organization.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    issuerUrl: '',
    clientId: '',
    clientSecret: '',
    enabled: false,
  });

  const callbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/auth/sso/callback`
    : '/api/v1/auth/sso/callback';

  const load = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    apiFetch<SsoConfig>(`/api/v1/orgs/${orgId}/sso`)
      .then((d) => {
        if (d.configured) {
          setForm({
            issuerUrl: d.issuerUrl || '',
            clientId: d.clientId || '',
            clientSecret: '',
            enabled: d.enabled ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!orgId || !canEdit) return;
    setSaving(true);
    setMsg('');
    try {
      await apiFetch(`/api/v1/orgs/${orgId}/sso`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setMsg(t('saved'));
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_REQUIRED') {
        setMsg(t('ssoPlanRequired'));
      } else {
        setMsg(err instanceof Error ? err.message : 'Error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card text-sm text-zinc-500">{t('ssoNotConfigured')}</div>;
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">{t('ssoTitle')}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t('ssoDesc', { slug: orgSlug || '—' })}</p>
      </div>

      {planTier !== 'business' && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          {t('ssoPlanRequired')}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        {t('ssoCallbackHint')} <code className="rounded bg-zinc-900 px-1 py-0.5">{callbackUrl}</code>
      </p>

      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('ssoIssuerUrl')}</label>
        <input
          className="input font-mono text-sm"
          value={form.issuerUrl}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
          placeholder="https://accounts.example.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('ssoClientId')}</label>
        <input
          className="input font-mono text-sm"
          value={form.clientId}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('ssoClientSecret')}</label>
        <input
          type="password"
          className="input font-mono text-sm"
          value={form.clientSecret}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
          placeholder="••••••••"
        />
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm text-zinc-300">{t('ssoEnabled')}</span>
      </label>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {canEdit && (
        <button type="button" className="btn-primary" disabled={saving || planTier !== 'business'} onClick={save}>
          {saving ? '...' : t('ssoSave')}
        </button>
      )}
    </div>
  );
}
