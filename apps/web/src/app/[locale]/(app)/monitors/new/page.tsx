'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { MonitorHttpConfig } from '@/components/monitor-http-config';
import { HttpMonitorConfig, buildHttpConfigPayload, defaultHttpConfig } from '@/lib/monitor-config';

export default function NewMonitorPage() {
  const t = useTranslations('monitors');
  const router = useRouter();
  const auth = getStoredAuth();
  const [form, setForm] = useState({ name: '', targetUrl: '', type: 'http', intervalSeconds: 300 });
  const [httpConfig, setHttpConfig] = useState<HttpMonitorConfig>(defaultHttpConfig());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const config = buildHttpConfigPayload(httpConfig, form.type);
      const m = await apiFetch<{ id: string }>(`/api/v1/orgs/${auth!.organization.id}/monitors`, {
        method: 'POST',
        body: JSON.stringify({ ...form, config: config || {} }),
      });
      router.push(`/monitors/${m.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('createTitle')}</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('friendlyName')}</label>
          <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('targetUrl')}</label>
          <input required className="input font-mono" placeholder="https://example.com" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
          <p className="mt-1 text-xs text-zinc-500">{t('targetUrlChainHint')}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('monitorType')}</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="http">{t('typeHttp')}</option>
            <option value="tcp">{t('typeTcp')}</option>
            <option value="ping">{t('typePing')}</option>
            <option value="keyword">{t('typeKeyword')}</option>
            <option value="ssl">{t('typeSsl')}</option>
          </select>
        </div>
        <MonitorHttpConfig type={form.type} config={httpConfig} onChange={setHttpConfig} />
        <div>
          <label className="mb-1 block text-sm text-zinc-400">{t('checkInterval')}</label>
          <select className="input" value={form.intervalSeconds} onChange={(e) => setForm({ ...form, intervalSeconds: Number(e.target.value) })}>
            <option value={300}>5 {t('minutes')}</option>
            <option value={60}>1 {t('minutes')}</option>
            <option value={30}>30 {t('seconds')}</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? '...' : t('createTitle')}</button>
      </form>
    </div>
  );
}
