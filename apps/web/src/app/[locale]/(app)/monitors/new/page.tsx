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
        <h1 className="text-xl font-bold">Heartbeat 监控已创建</h1>
        <p className="text-sm text-zinc-400">定时向以下 URL 发送 POST 请求（如 cron job）：</p>
        <code className="block break-all rounded bg-zinc-900 p-3 text-sm">{hbInfo.url}</code>
        <button className="btn-primary" onClick={() => router.push('/monitors')}>返回列表</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('createTitle')}</h1>
      <div className="flex flex-wrap gap-2">
        {MONITOR_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
            onClick={() => {
              setForm({ name: locale === 'zh' ? tpl.nameZh : tpl.name, targetUrl: tpl.targetUrl, type: tpl.type, intervalSeconds: tpl.intervalSeconds, regions: 'us-east,eu-west' });
              setHttpConfig(tpl.config ? parseHttpConfig(tpl.config) : defaultHttpConfig());
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
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
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
          <label className="mb-1 block text-sm text-zinc-400">检测区域（多区域探针）</label>
          <input className="input font-mono text-sm" value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} placeholder="us-east, eu-west" />
        </div>
        <MonitorHttpConfig type={form.type} config={httpConfig} onChange={setHttpConfig} />
        {form.type === 'ssl' && <MonitorSslConfig config={sslConfig} onChange={setSslConfig} />}
        {form.type === 'dns' && <MonitorDnsConfig config={dnsConfig} onChange={setDnsConfig} />}
        {form.type === 'tamper' && <MonitorTamperConfig config={tamperConfig} onChange={setTamperConfig} />}
        {form.type === 'pagespeed' && <MonitorPageSpeedConfig config={pageSpeedConfig} onChange={setPageSpeedConfig} />}
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('checkInterval')}</label>
          <select className="input" value={form.intervalSeconds} onChange={(e) => setForm({ ...form, intervalSeconds: Number(e.target.value) })}>
            <option value={300}>5 {t('minutes')}</option>
            <option value={60}>1 {t('minutes')}</option>
            <option value={30}>30 {t('seconds')}</option>
          </select>
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
