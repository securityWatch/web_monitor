'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, getStoredAuth, ApiError } from '@/lib/api';
import { UpgradeModal } from '@/components/upgrade-modal';
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
  parseHttpConfig,
  parseTamperConfig,
  SslMonitorConfig,
  TamperMonitorConfig,
} from '@/lib/monitor-config';
import { MONITOR_TEMPLATES } from '@/lib/monitor-templates';
import { useLocale } from 'next-intl';

export default function NewMonitorPage() {
  const t = useTranslations('monitors');
  const locale = useLocale();
  const router = useRouter();
  const auth = getStoredAuth();
  const [form, setForm] = useState({ name: '', targetUrl: '', type: 'http', intervalSeconds: 300, regions: 'us-east,eu-west' });
  const [httpConfig, setHttpConfig] = useState<HttpMonitorConfig>(defaultHttpConfig());
  const [sslConfig, setSslConfig] = useState<SslMonitorConfig>(defaultSslConfig());
  const [dnsConfig, setDnsConfig] = useState<DnsMonitorConfig>(defaultDnsConfig());
  const [tamperConfig, setTamperConfig] = useState<TamperMonitorConfig>(defaultTamperConfig());
  const [pageSpeedConfig, setPageSpeedConfig] = useState<PageSpeedMonitorConfig>(defaultPageSpeedConfig());
  const [alertConfig, setAlertConfig] = useState(defaultAlertConfig());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hbInfo, setHbInfo] = useState<{ token?: string; url?: string } | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<'quota' | 'email' | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDraftMsg, setAiDraftMsg] = useState('');
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const planTier = auth?.organization.planTier || 'free';
  const paidPlan = planTier !== 'free';
  const tamperAIOn = form.type === 'tamper' && !!tamperConfig.aiContentRecognitionEnabled;
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
    if (form.type === 'tamper' && next.aiContentRecognitionEnabled && !paidPlan && form.intervalSeconds < 1800) {
      setForm((f) => ({ ...f, intervalSeconds: 1800 }));
    }
  };

  const updateMonitorType = (type: string) => {
    setForm((f) => ({
      ...f,
      type,
      intervalSeconds: type === 'tamper' && tamperConfig.aiContentRecognitionEnabled && !paidPlan && f.intervalSeconds < 1800 ? 1800 : f.intervalSeconds,
    }));
  };

  const generateAIDraft = async () => {
    if (!auth?.organization.id || !aiPrompt.trim()) return;
    setAiDraftLoading(true);
    setAiDraftMsg('');
    try {
      const res = await apiFetch<{
        draft: { name: string; type: string; targetUrl: string; intervalSeconds: number; config?: Record<string, unknown>; regions?: string[]; explanation?: string };
      }>(`/api/v1/orgs/${auth.organization.id}/monitors/ai-draft`, {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const d = res.draft;
      setForm({
        name: d.name || form.name,
        targetUrl: d.targetUrl || form.targetUrl,
        type: d.type || 'http',
        intervalSeconds: d.intervalSeconds || 300,
        regions: (d.regions || ['us-east', 'eu-west']).join(','),
      });
      setHttpConfig(parseHttpConfig(d.config || {}));
      setTamperConfig(parseTamperConfig(d.config || {}));
      setAiDraftMsg(d.explanation || t('aiDraftApplied'));
    } catch (err) {
      setAiDraftMsg(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const securityPayload = () => {
    if (form.type === 'ssl') return { ssl: sslConfig };
    if (form.type === 'dns') return { dns: dnsConfig };
    if (form.type === 'tamper') return { tamper: tamperConfig };
    if (form.type === 'pagespeed') return { pagespeed: pageSpeedConfig };
    return undefined;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const httpPayload = buildHttpConfigPayload(httpConfig, form.type);
      const config = mergeMonitorConfigForSave({}, httpPayload, alertConfig, securityPayload());
      const regions = form.regions.split(/[,，\s]+/).filter(Boolean);
      const m = await apiFetch<{ id: string; heartbeatToken?: string }>(`/api/v1/orgs/${auth!.organization.id}/monitors`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          targetUrl: form.type === 'heartbeat' ? 'heartbeat://ping' : form.targetUrl,
          intervalSeconds: form.intervalSeconds,
          config,
          regions,
        }),
      });
      if (form.type === 'heartbeat' && m.heartbeatToken) {
        setHbInfo({ token: m.heartbeatToken, url: `${window.location.origin}/api/v1/heartbeat/${m.heartbeatToken}` });
        return;
      }
      router.push(`/monitors/${m.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MONITOR_QUOTA_EXCEEDED') setUpgradeModal('quota');
        else if (err.code === 'EMAIL_NOT_VERIFIED') setUpgradeModal('email');
        else setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (hbInfo) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 card">
        <h1 className="text-xl font-bold">{t('heartbeatCreatedTitle')}</h1>
        <p className="text-sm text-zinc-400">{t('heartbeatCreatedDesc')}</p>
        <code className="block break-all rounded bg-zinc-900 p-3 text-sm">{hbInfo.url}</code>
        <button className="btn-primary" onClick={() => router.push('/monitors')}>{t('heartbeatBackToList')}</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('createTitle')}</h1>
      <div className="card border-blue-500/20 bg-blue-500/5 space-y-3">
        <div>
          <p className="font-semibold text-blue-100">{t('aiDraftTitle')}</p>
          <p className="mt-1 text-xs text-blue-100/60">{t('aiDraftDesc')}</p>
        </div>
        <textarea
          className="input min-h-[72px]"
          placeholder={t('aiDraftPlaceholder')}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <button type="button" className="btn-secondary text-sm" disabled={aiDraftLoading || !aiPrompt.trim()} onClick={generateAIDraft}>
          {aiDraftLoading ? '...' : t('aiDraftButton')}
        </button>
        {aiDraftMsg && <p className="text-xs text-blue-100/70">{aiDraftMsg}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {MONITOR_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
            onClick={() => {
              setForm({ name: locale === 'zh' ? tpl.nameZh : tpl.name, targetUrl: tpl.targetUrl, type: tpl.type, intervalSeconds: tpl.intervalSeconds, regions: 'us-east,eu-west' });
              setHttpConfig(tpl.config ? parseHttpConfig(tpl.config) : defaultHttpConfig());
              setTamperConfig(tpl.config ? parseTamperConfig(tpl.config) : defaultTamperConfig());
            }}
          >
            {locale === 'zh' ? tpl.nameZh : tpl.name}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('friendlyName')}</label>
          <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        {form.type !== 'heartbeat' && (
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('targetUrl')}</label>
            <input required className="input font-mono" placeholder={t('targetUrlPlaceholder')} value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
            <p className="mt-1 text-xs text-zinc-500">{t('targetUrlChainHint')}</p>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('monitorType')}</label>
          <select className="input" value={form.type} onChange={(e) => updateMonitorType(e.target.value)}>
            <option value="http">{t('typeHttp')}</option>
            <option value="tcp">{t('typeTcp')}</option>
            <option value="ping">{t('typePing')}</option>
            <option value="api_json">{t('typeApiJson')}</option>
            <option value="keyword">{t('typeKeyword')}</option>
            <option value="ssl">{t('typeSsl')}</option>
            <option value="dns">{t('typeDns')}</option>
            <option value="tamper">{t('typeTamper')}</option>
            <option value="domain">{t('typeDomain')}</option>
            <option value="pagespeed">{t('typePagespeed')}</option>
            <option value="heartbeat">Heartbeat / Cron</option>
          </select>
          {form.type === 'pagespeed' && (
            <p className="mt-2 text-xs text-amber-500/90">{t('pagespeedEstimatedNote')}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('regionsLabel')}</label>
          <input className="input font-mono text-sm" value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} placeholder="us-east, eu-west" />
        </div>
        <MonitorHttpConfig type={form.type} config={httpConfig} onChange={setHttpConfig} />
        {form.type === 'ssl' && <MonitorSslConfig config={sslConfig} onChange={setSslConfig} />}
        {form.type === 'dns' && <MonitorDnsConfig config={dnsConfig} onChange={setDnsConfig} />}
        {form.type === 'tamper' && <MonitorTamperConfig config={tamperConfig} onChange={updateTamperConfig} />}
        {form.type === 'pagespeed' && <MonitorPageSpeedConfig config={pageSpeedConfig} onChange={setPageSpeedConfig} />}
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
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-300">{t('alertSettingsTitle')}</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={alertConfig.webhookEnabled}
              onChange={(e) => setAlertConfig({ webhookEnabled: e.target.checked })}
              className="mt-0.5 rounded"
            />
            <span>
              <span className="block text-sm text-zinc-300">{t('webhookAlertsEnabled')}</span>
              <span className="block text-xs text-zinc-500">{t('webhookAlertsHint')}</span>
            </span>
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? '...' : t('createTitle')}</button>
      </form>
      <UpgradeModal open={!!upgradeModal} reason={upgradeModal || 'quota'} onClose={() => setUpgradeModal(null)} />
    </div>
  );
}
