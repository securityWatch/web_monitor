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
import {
  HttpMonitorConfig,
  buildHttpConfigPayload,
  defaultAlertConfig,
  defaultDnsConfig,
  defaultHttpConfig,
  defaultSslConfig,
  defaultTamperConfig,
  DnsMonitorConfig,
  mergeMonitorConfigForSave,
  parseAlertConfig,
  parseDnsConfig,
  parseHttpConfig,
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
  const [form, setForm] = useState({ name: '', targetUrl: '', intervalSeconds: 300 });
  const [type, setType] = useState('http');
  const [httpConfig, setHttpConfig] = useState<HttpMonitorConfig>(defaultHttpConfig());
  const [sslConfig, setSslConfig] = useState<SslMonitorConfig>(defaultSslConfig());
  const [dnsConfig, setDnsConfig] = useState<DnsMonitorConfig>(defaultDnsConfig());
  const [tamperConfig, setTamperConfig] = useState<TamperMonitorConfig>(defaultTamperConfig());
  const [alertConfig, setAlertConfig] = useState(defaultAlertConfig());
  const [rawConfig, setRawConfig] = useState<unknown>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        setAlertConfig(parseAlertConfig(m.config));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [orgId, id]);

  const securityPayload = () => {
    if (type === 'ssl') return { ssl: sslConfig };
    if (type === 'dns') return { dns: dnsConfig };
    if (type === 'tamper') return { tamper: tamperConfig };
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
        {type === 'tamper' && <MonitorTamperConfig monitorId={id} config={tamperConfig} onChange={setTamperConfig} />}
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
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '...' : t('saveChanges')}</button>
          <Link href={`/monitors/${id}`} className="btn-secondary flex-1 text-center">{tc('cancel')}</Link>
        </div>
      </form>
    </div>
  );
}
