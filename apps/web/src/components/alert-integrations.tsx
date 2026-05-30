'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface AlertChannelConfig {
  url?: string;
  email?: string;
  routingKey?: string;
  apiKey?: string;
  phone?: string;
  secret?: string;
  signEnabled?: boolean;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: AlertChannelConfig;
  enabled: boolean;
}

const CHANNEL_TYPES = [
  { id: 'webhook', labelKey: 'typeWebhook' },
  { id: 'slack', labelKey: 'typeSlack' },
  { id: 'discord', labelKey: 'typeDiscord' },
  { id: 'teams', labelKey: 'typeTeams' },
  { id: 'dingtalk', labelKey: 'typeDingTalk' },
  { id: 'feishu', labelKey: 'typeFeishu' },
  { id: 'wecom', labelKey: 'typeWeCom' },
  { id: 'pagerduty', labelKey: 'typePagerDuty' },
  { id: 'opsgenie', labelKey: 'typeOpsgenie' },
  { id: 'sms', labelKey: 'typeSms' },
  { id: 'voice', labelKey: 'typeVoice' },
] as const;

const CN_SIGN_TYPES = new Set(['dingtalk', 'feishu']);
const URL_TYPES = new Set(['webhook', 'slack', 'discord', 'teams', 'dingtalk', 'feishu', 'wecom']);

const emptyForm = () => ({
  type: 'webhook',
  name: '',
  url: '',
  routingKey: '',
  apiKey: '',
  phone: '',
  secret: '',
  signEnabled: false,
  delayMinutes: 0,
  eventType: 'all',
});

const EVENT_TYPES = [
  { id: 'all', labelKey: 'eventAll' },
  { id: 'down', labelKey: 'eventDown' },
  { id: 'up', labelKey: 'eventUp' },
  { id: 'security', labelKey: 'eventSecurity' },
  { id: 'ssl_warning', labelKey: 'eventSslWarning' },
  { id: 'dns_change', labelKey: 'eventDnsChange' },
  { id: 'tamper_major_change', labelKey: 'eventTamperMajor' },
  { id: 'tamper_policy_violation', labelKey: 'eventTamperPolicy' },
] as const;

export function AlertIntegrations() {
  const t = useTranslations('settings.integrations');
  const tc = useTranslations('common');
  const orgId = getStoredAuth()?.organization.id;
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [form, setForm] = useState(emptyForm);
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
    const isOG = form.type === 'opsgenie';
    const isSMS = form.type === 'sms';
    const isVoice = form.type === 'voice';
    const needsUrl = URL_TYPES.has(form.type);
    if (isPD && !form.routingKey.trim()) return;
    if (isOG && !form.apiKey.trim()) return;
    if ((isSMS || isVoice) && !form.phone.trim()) return;
    if (needsUrl && !form.url.trim()) return;

    let config: AlertChannelConfig = { url: form.url.trim() };
    if (isPD) config = { routingKey: form.routingKey.trim() };
    if (isOG) config = { apiKey: form.apiKey.trim() };
    if (isSMS || isVoice) config = { phone: form.phone.trim() };
    if (CN_SIGN_TYPES.has(form.type)) {
      config = {
        url: form.url.trim(),
        secret: form.secret.trim(),
        signEnabled: form.signEnabled,
      };
    }

    await apiFetch(`/api/v1/orgs/${orgId}/alert-channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        type: form.type,
        config,
        enabled: true,
        delayMinutes: form.delayMinutes,
        eventType: form.eventType,
      }),
    });
    setForm(emptyForm());
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

  const channelHintKey = () => {
    if (form.type === 'dingtalk') return 'dingtalkHint';
    if (form.type === 'feishu') return 'feishuHint';
    if (form.type === 'wecom') return 'wecomHint';
    return 'webhookHint';
  };

  const channelSummary = (ch: AlertChannel) => {
    const parts = [ch.config?.url, ch.config?.routingKey, ch.config?.apiKey, ch.config?.phone].filter(Boolean);
    if (ch.config?.signEnabled) parts.push(t('signEnabledBadge'));
    return parts.join(' · ') || '—';
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
              <label className="mb-1 block text-xs text-zinc-500">{t('pagerDutyKey')}</label>
              <input className="input font-mono text-sm" value={form.routingKey} onChange={(e) => setForm({ ...form, routingKey: e.target.value })} />
            </>
          ) : form.type === 'opsgenie' ? (
            <>
              <label className="mb-1 block text-xs text-zinc-500">{t('opsgenieKey')}</label>
              <input className="input font-mono text-sm" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </>
          ) : form.type === 'sms' || form.type === 'voice' ? (
            <>
              <label className="mb-1 block text-xs text-zinc-500">{t('smsPhone')}</label>
              <input className="input font-mono text-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+8613800138000" />
              <p className="mt-1 text-xs text-zinc-600">{form.type === 'voice' ? t('voiceHint') : t('smsHint')}</p>
            </>
          ) : (
            <>
              <label className="mb-1 block text-xs text-zinc-500">{t('webhookUrl')}</label>
              <input className="input font-mono text-sm" placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-600">{t(channelHintKey())}</p>
            </>
          )}
        </div>
        {CN_SIGN_TYPES.has(form.type) && (
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">{t('signSecret')}</label>
              <input
                className="input font-mono text-sm"
                type="password"
                autoComplete="off"
                placeholder={t('signSecretPlaceholder')}
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="rounded border-zinc-600 bg-zinc-900"
                checked={form.signEnabled}
                onChange={(e) => setForm({ ...form, signEnabled: e.target.checked })}
              />
              {t('signEnabled')}
            </label>
            <p className="text-xs text-zinc-600">{t('signHint')}</p>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{t('eventType')}</label>
          <select className="input max-w-md" value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
            {EVENT_TYPES.map((et) => (
              <option key={et.id} value={et.id}>{t(et.labelKey)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{t('delayMinutes')}</label>
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
                  <p className="mt-1 truncate font-mono text-xs text-zinc-500">{channelSummary(ch)}</p>
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
