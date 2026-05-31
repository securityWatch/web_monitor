'use client';

import { useState } from 'react';
import { Activity, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

interface PingResult {
  host: string;
  isUp: boolean;
  responseMs: number;
  error?: string;
}

export function PingTestTool() {
  const t = useTranslations('extraTools.pingTest');
  const [host, setHost] = useState('');
  const [result, setResult] = useState<PingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const ping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setLoading(true);
    setResult(null);
    setFetchError('');
    try {
      const res = await fetch(`/api/v1/public/ping?host=${encodeURIComponent(host.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || t('failed'));
        return;
      }
      setResult(data);
    } catch {
      setFetchError(t('failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <form onSubmit={ping} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <input
          className="input flex-1 font-mono text-sm"
          placeholder={t('placeholder')}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <button type="submit" disabled={loading || !host.trim()} className="btn-primary shrink-0 px-6">
          {loading ? t('pinging') : t('ping')}
        </button>
      </form>
      {fetchError && <p className="mt-4 text-sm text-red-400">{fetchError}</p>}
      {result && (
        <div className={`mt-6 card ${result.isUp ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
          <div className="flex items-start gap-3">
            {result.isUp ? (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm break-all">{result.host}</p>
              <p className={`mt-2 text-lg font-semibold ${result.isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.isUp ? t('reachable') : t('unreachable')}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">{t('responseTime')}</dt>
                  <dd className="font-mono">{result.responseMs} ms</dd>
                </div>
                {result.error && (
                  <div>
                    <dt className="text-zinc-500">{t('errorDetail')}</dt>
                    <dd className="mt-1 text-xs text-zinc-400 break-words">{result.error}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-500">
            <Activity className="mr-1 inline h-3 w-3" aria-hidden />
            {t('cta')}{' '}
            <Link href="/register" className="text-blue-400 hover:underline">
              {t('ctaLink')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
