'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getApiUrl } from '@/lib/api';
import { formatUptime } from '@/lib/utils';
import { Activity, Bell, CheckCircle } from 'lucide-react';

interface Component {
  monitorId: string;
  name: string;
  status: string;
  targetUrl: string;
  uptime24h: number;
}

interface PublicStatus {
  name: string;
  slug: string;
  components: Component[];
  updatedAt: string;
}

export default function PublicStatusPage() {
  const t = useTranslations('statusPages');
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PublicStatus | null>(null);
  const [subEmail, setSubEmail] = useState('');
  const [subMsg, setSubMsg] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const base = getApiUrl();
    fetch(`${base}/api/v1/public/status/${slug}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, [slug]);

  useEffect(() => {
    const token = searchParams.get('subscribe');
    if (!token || !slug) return;
    const base = getApiUrl();
    fetch(`${base}/api/v1/public/status/${slug}/subscribe/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (r.ok) setConfirmed(true);
        else setSubMsg('订阅确认失败，链接可能已过期');
      })
      .catch(() => setSubMsg('订阅确认失败'));
  }, [searchParams, slug]);

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubLoading(true);
    setSubMsg('');
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/v1/public/status/${slug}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subEmail }),
      });
      if (res.ok) setSubMsg('确认邮件已发送，请查收邮箱完成订阅');
      else setSubMsg('订阅失败');
    } catch {
      setSubMsg('订阅失败');
    } finally {
      setSubLoading(false);
    }
  };

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-zinc-500">{t('loading')}</div>;
  }

  const allUp = data.components.every((c) => c.status === 'up');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 flex items-center gap-2 text-zinc-400">
          <Activity className="h-5 w-5 text-blue-500" />
          <span className="text-sm">PulseWatch</span>
        </div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <div className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm font-medium ${allUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {allUp ? t('allOperational') : t('degraded')}
        </div>

        {confirmed && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            订阅已确认，故障时将收到邮件通知
          </div>
        )}

        <div className="mt-8 space-y-3">
          {data.components.map((c) => (
            <div key={c.monitorId} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-zinc-500">{c.targetUrl}</p>
              </div>
              <div className="text-right">
                <span className={`badge-${c.status === 'up' ? 'up' : c.status === 'down' ? 'down' : 'paused'}`}>{c.status}</span>
                <p className="mt-1 font-mono text-xs text-zinc-500">{formatUptime(c.uptime24h)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
            <Bell className="h-4 w-4" />
            订阅状态更新
          </div>
          <form onSubmit={subscribe} className="flex gap-2">
            <input
              type="email"
              required
              className="input flex-1"
              placeholder="your@email.com"
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
            />
            <button type="submit" disabled={subLoading} className="btn-primary shrink-0">
              {subLoading ? '...' : '订阅'}
            </button>
          </form>
          {subMsg && <p className="mt-2 text-xs text-zinc-400">{subMsg}</p>}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          {t('poweredBy')} · {new Date(data.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
