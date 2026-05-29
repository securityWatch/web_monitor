'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getApiUrl } from '@/lib/api';
import { formatUptime } from '@/lib/utils';
import { Activity } from 'lucide-react';

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
  const [data, setData] = useState<PublicStatus | null>(null);

  useEffect(() => {
    const base = getApiUrl();
    fetch(`${base}/api/v1/public/status/${slug}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, [slug]);

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

        <p className="mt-8 text-center text-xs text-zinc-600">
          {t('poweredBy')} · {new Date(data.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
