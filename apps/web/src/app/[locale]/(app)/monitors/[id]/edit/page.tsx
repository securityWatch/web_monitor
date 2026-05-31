'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { MonitorHttpConfig } from '@/components/monitor-http-config';
import { MonitorSslConfig } from '@/components/monitor-ssl-config';
import { MonitorDnsConfig } from '@/components/monitor-dns-config';
import { MonitorTamperConfig } from '@/components/monitor-tamper-config';
import { MonitorPageSpeedConfig } from '@/components/monitor-pagespeed-config';
import {
  HttpMonitorConfig,
  buildHttpConfigPayload,
  defaultAlertConfig,
  defaultDnsConfig,
  defaultHttpConfig,
  defaultPageSpeedConfig,
  defaultSslConfig,
  defaultTamperConfig,
  DnsMonitorConfig,
  mergeMonitorConfigForSave,
  PageSpeedMonitorConfig,
  parseAlertConfig,
  parseDnsConfig,
  parseHttpConfig,
  parsePageSpeedConfig,
  parseSslConfig,
  parseTamperConfig,
  SslMonitorConfig,
  TamperMonitorConfig,
} from '@/lib/monitor-config';

interface Monitor {
  id: string;
  name: string;
  targetUrl: string;
  type: string;
  intervalSeconds: number;
  config?: unknown;
}

export default function EditMonitorPage() {
  const t = useTranslations('monitors');
  const tc = useTranslations('common');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const auth = getStoredAuth();
  const orgId = auth?.organization.id;
  const planTier = auth?.organization.planTier || 'free';
  const paidPlan = planTier !== 'free';
  const [form, setForm] = useState({ name: '', targetUrl: '', intervalSeconds: 300 });
  const [type, setType] = useState('http');
  const [httpConfig, setHttpConfig] = useState<HttpMonitorConfig>(defaultHttpConfig());
  const [sslConfig, setSslConfig] = useState<SslMonitorConfig>(defaultSslConfig());
  const [dnsConfig, setDnsConfig] = useState<DnsMonitorConfig>(defaultDnsConfig());
  const [tamperConfig, setTamperConfig] = useState<TamperMonitorConfig>(defaultTamperConfig());
  const [pageSpeedConfig, setPageSpeedConfig] = useState<PageSpeedMonitorConfig>(defaultPageSpeedConfig());
  const [alertConfig, setAlertConfig] = useState(defaultAlertConfig());
  const [rawConfig, setRawConfig] = useState<unknown>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDraftMsg, setAiDraftMsg] = useState('');
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const tamperAIOn = type === 'tamper' && !!tamperConfig.aiContentRecognitionEnabled;
  const intervalOptions = tamperAIOn && !paidPlan
    ? [{ value: 1800, label: `30 ${t('minutes')}` }]
    : [
        { value: 1800, label: `30 ${t('minutes')}` },
        { value: 300, label: `5 ${t('minutes')}` },
        { value: 60, label: `1 ${t('minutes')}` },
        { value: 30, label: `30 ${t('seconds')}` },
      ];

  const updateTamperConfig = (next: TamperMonitorConfig) => {
    setTamperConfig(next);
    if (type === 'tamper' && next.aiContentRecognitionEnabled && !paidPlan && form.intervalSeconds < 1800) {
      setForm((f) => ({ ...f, intervalSeconds: 1800 }));
    }
  };

  useEffect(() => {
    if (!orgId || !id) return;
    apiFetch<Monitor>(`/api/v1/orgs/${orgId}/monitors/${id}`)
      .then((m) => {
        setForm({ name: m.name, targetUrl: m.targetUrl, intervalSeconds: m.intervalSeconds });
        setType(m.type);
        setRawConfig(m.config ?? {});
        setHttpConfig(parseHttpConfig(m.config));
        setSslConfig(parseSslConfig(m.config));
        setDnsConfig(parseDnsConfig(m.config));
        setTamperConfig(parseTamperConfig(m.config));
        setPageSpeedConfig(parsePageSpeedConfig(m.config));
        setAlertConfig(parseAlertConfig(m.config));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [orgId, id]);

  const applyDraftConfig = (config: Record<string, unknown>) => {
    setHttpConfig(parseHttpConfig(config));
    if (type === 'ssl') setSslConfig(parseSslConfig(config));
    if (type === 'dns') setDnsConfig(parseDnsConfig(config));
    if (type === 'tamper') setTamperConfig(parseTamperConfig(config));
    if (type === 'pagespeed') setPageSpeedConfig(parsePageSpeedConfig(config));
  };

  const generateAIDraft = async () => {
    if (!orgId || !aiPrompt.trim()) return;
    setAiDraftLoading(true);
    setAiDraftMsg('');
    try {
      const contextPrompt = [
        'Update an existing PulseWatch monitor. Monitor type is FIXED and must not change.',
        `type=${type}`,
        `name=${form.name}`,
        `targetUrl=${form.targetUrl}`,
        `intervalSeconds=${form.intervalSeconds}`,
        'User change request:',
        aiPrompt.trim(),
      ].join('\n');
      const res = await apiFetch<{
        draft: {
          name: string;
          type: string;
          targetUrl: string;
          intervalSeconds: number;
          config?: Record<string, unknown>;
          explanation?: string;
        };
      }>(`/api/v1/orgs/${orgId}/monitors/ai-draft`, {
        method: 'POST',
        body: JSON.stringify({ prompt: contextPrompt }),
      });
      const d = res.draft;
      const cfg = (d.config || {}) as Record<string, unknown>;
      let nextInterval = d.intervalSeconds > 0 ? d.intervalSeconds : form.intervalSeconds;
      const nextTamper = type === 'tamper' ? parseTamperConfig(cfg) : tamperConfig;
      if (type === 'tamper' && nextTamper.aiContentRecognitionEnabled && !paidPlan && nextInterval < 1800) {
        nextInterval = 1800;
      }
      setForm({
        name: d.name || form.name,
        targetUrl: d.targetUrl || form.targetUrl,
        intervalSeconds: nextInterval,
      });
      applyDraftConfig(cfg);
      setAiDraftMsg(d.explanation || t('aiDraftApplied'));
    } catch (err) {
      setAiDraftMsg(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const securityPayload = () => {
    if (type === 'ssl') return { ssl: sslConfig };
    if (type === 'dns') return { dns: dnsConfig };
    if (type === 'tamper') return { tamper: tamperConfig };
    if (type === 'pagespeed') return { pagespeed: pageSpeedConfig };
    return undefined;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !id) return;
    setSaving(true);
    setError('');
    try {
      const httpPayload = buildHttpConfigPayload(httpConfig, type);
      const config = mergeMonitorConfigForSave(rawConfig, httpPayload, alertConfig, securityPayload());
      await apiFetch(`/api/v1/orgs/${orgId}/monitors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, config }),
      });
      router.push(`/monitors/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-zinc-500">{tc('loading')}</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('editTitle')}</h1>
        <Link href={`/monitors/${id}`} className="text-sm text-zinc-400 hover:text-white">{tc('back')}</Link>
      </div>
      <div className="card border-blue-500/20 bg-blue-500/5 space-y-3">
        <div>
          <p className="font-semibold text-blue-100">{t('aiDraftTitle')}</p>
          <p className="mt-1 text-xs text-blue-100/60">{t('aiDraftEditDesc')}</p>
        </div>
        <textarea
          className="input min-h-[72px]"
          placeholder={t('aiDraftEditPlaceholder')}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={aiDraftLoading || !aiPrompt.trim()}
          onClick={generateAIDraft}
        >
          {aiDraftLoading ? '...' : t('aiDraftEditButton')}
        </button>
        {aiDraftMsg && <p className="text-xs text-blue-100/70">{aiDraftMsg}</p>}
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('friendlyName')}</label>
          <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('targetUrl')}</label>
          <input required className="input font-mono" placeholder={t('targetUrlPlaceholder')} value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
          <p className="mt-1 text-xs text-zinc-500">{t('targetUrlChainHint')}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('monitorType')}</label>
          <input readOnly className="input uppercase opacity-60" value={type} />
          <p className="mt-1 text-xs text-zinc-500">{t('typeReadonly')}</p>
        </div>
        <MonitorHttpConfig type={type} config={httpConfig} onChange={setHttpConfig} />
        {type === 'ssl' && <MonitorSslConfig config={sslConfig} onChange={setSslConfig} />}
        {type === 'dns' && <MonitorDnsConfig config={dnsConfig} onChange={setDnsConfig} />}
        {type === 'tamper' && <MonitorTamperConfig monitorId={id} config={tamperConfig} onChange={updateTamperConfig} />}
        {type === 'pagespeed' && <MonitorPageSpeedConfig config={pageSpeedConfig} onChange={setPageSpeedConfig} />}
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('checkInterval')}</label>
          <select className="input" value={form.intervalSeconds} onChange={(e) => setForm({ ...form, intervalSeconds: Number(e.target.value) })}>
            {intervalOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {tamperAIOn && (
            <p className="mt-1 text-xs text-zinc-500">{paidPlan ? t('tamperAIPaidInterval') : t('tamperAIFreeInterval')}</p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
          <p className="text-sm font-medium text-zinc-300">{t('alertSettingsTitle')}</p>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('consecutiveFailuresBeforeAlert')}</label>
            <input
              type="number"
              min={1}
              max={10}
              className="input w-32"
              value={alertConfig.consecutiveFailuresBeforeAlert}
              onChange={(e) => {
                const n = Math.min(10, Math.max(1, Number(e.target.value) || 1));
                setAlertConfig({ ...alertConfig, consecutiveFailuresBeforeAlert: n });
              }}
            />
            <p className="mt-1 text-xs text-zinc-500">{t('consecutiveFailuresHint')}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={alertConfig.webhookEnabled}
              onChange={(e) => setAlertConfig({ ...alertConfig, webhookEnabled: e.target.checked })}
              className="mt-0.5 rounded"
            />
            <span>
              <span className="block text-sm text-zinc-300">{t('webhookAlertsEnabled')}</span>
              <span className="block text-xs text-zinc-500">{t('webhookAlertsHint')}</span>
            </span>
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '...' : t('saveChanges')}</button>
          <Link href={`/monitors/${id}`} className="btn-secondary flex-1 text-center">{tc('cancel')}</Link>
        </div>
      </form>
    </div>
  );
}
