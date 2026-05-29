'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: { url?: string; email?: string; routingKey?: string };
  enabled: boolean;
}

const CHANNEL_TYPES = [
  { id: 'webhook', labelKey: 'typeWebhook' },
  { id: 'slack', labelKey: 'typeSlack' },
  { id: 'discord', labelKey: 'typeDiscord' },
  { id: 'pagerduty', labelKey: 'typePagerDuty' },
] as const;

export function AlertIntegrations() {
  const t = useTranslations('settings.integrations');
  const tc = useTranslations('common');
  const orgId = getStoredAuth()?.organization.id;
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [form, setForm] = useState({ type: 'webhook', name: '', url: '', routingKey: '', delayMinutes: 0 });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!orgId) return;
    apiFetch<{ channels: AlertChannel[] }>(`/api/v1/orgs/${orgId}/alert-channels`)
      .then((d) => setChannels(d.channels))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!orgId || !form.name.trim()) return;
    const isPD = form.type === 'pagerduty';
    if (isPD && !form.routingKey.trim()) return;
    if (!isPD && !form.url.trim()) return;
    await apiFetch(`/api/v1/orgs/${orgId}/alert-channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        type: form.type,
        config: isPD ? { routingKey: form.routingKey.trim() } : { url: form.url.trim() },
        enabled: true,
        delayMinutes: form.delayMinutes,
      }),
    });
    setForm({ type: 'webhook', name: '', url: '', routingKey: '', delayMinutes: 0 });
    setMsg(t('channelCreated'));
    load();
  };

  const toggle = async (ch: AlertChannel) => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/alert-channels/${ch.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !ch.enabled }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!orgId || !confirm(t('deleteConfirm'))) return;
    await apiFetch(`/api/v1/orgs/${orgId}/alert-channels/${id}`, { method: 'DELETE' });
    load();
  };

  const test = async (id: string) => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/alert-channels/${id}/test`, { method: 'POST' });
    setMsg(t('testSent'));
  };

  if (loading) return <p className="text-zinc-500">{tc('loading')}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-400">{t('desc')}</p>
      </div>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <div className="card space-y-4">
        <h3 className="font-semibold">{t('addChannel')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{t('channelType')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CHANNEL_TYPES.map((ct) => (
                <option key={ct.id} value={ct.id}>{t(ct.labelKey)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{t('channelName')}</label>
            <input className="input" placeholder={t('channelNamePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        </div>
        <div>
          {form.type === 'pagerduty' ? (
            <>
              <label className="mb-1 block text-xs text-zinc-500">PagerDuty Routing Key</label>
              <input className="input font-mono text-sm" value={form.routingKey} onChange={(e) => setForm({ ...form, routingKey: e.target.value })} />
            </>
          ) : (
            <>
              <label className="mb-1 block text-xs text-zinc-500">{t('webhookUrl')}</label>
              <input className="input font-mono text-sm" placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-600">{t('webhookHint')}</p>
            </>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">告警延迟（分钟，DOWN 持续 N 分钟后通知）</label>
          <input type="number" min={0} className="input w-32" value={form.delayMinutes} onChange={(e) => setForm({ ...form, delayMinutes: Number(e.target.value) })} />
        </div>
        <button type="button" onClick={create} className="btn-primary">{t('addChannel')}</button>
      </div>

      <div className="card">
        <h3 className="font-semibold">{t('existingChannels')}</h3>
        {channels.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">{t('noChannels')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {channels.filter((c) => c.type !== 'email').map((ch) => (
              <div key={ch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 p-3">
                <div>
                  <p className="font-medium">{ch.name} <span className="text-xs text-zinc-500">({ch.type})</span></p>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-500">{ch.config?.url || ch.config?.routingKey || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => test(ch.id)}>{t('sendTest')}</button>
                  <button type="button" className={`rounded px-2 py-1 text-xs ${ch.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`} onClick={() => toggle(ch)}>
                    {ch.enabled ? tc('enabled') : tc('disabled')}
                  </button>
                  <button type="button" className="text-xs text-red-400" onClick={() => remove(ch.id)}>{tc('delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
