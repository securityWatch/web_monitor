'use client';

import { useState } from 'react';
import { ArrowRight, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

interface RedirectHop {
  url: string;
  statusCode?: number;
  responseMs: number;
  location?: string;
  error?: string;
}

interface RedirectResult {
  startUrl: string;
  finalUrl: string;
  hops: RedirectHop[];
  hopCount: number;
  totalResponseMs: number;
  error?: string;
}

export function RedirectCheckerTool() {
  const t = useTranslations('extraTools.redirectChecker');
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<RedirectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setFetchError('');
    try {
      const res = await fetch(`/api/v1/public/redirect-check?url=${encodeURIComponent(url.trim())}`);
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
      <form onSubmit={check} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <input
          className="input flex-1 font-mono text-sm"
          placeholder={t('placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={loading || !url.trim()} className="btn-primary shrink-0 px-6">
          {loading ? t('checking') : t('check')}
        </button>
      </form>
      {fetchError && <p className="mt-4 text-sm text-red-400">{fetchError}</p>}
      {result && (
        <div className="mt-6 card border-blue-500/30">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{t('hopCount', { count: result.hopCount })}</span>
            <span>·</span>
            <span>{t('totalTime', { ms: result.totalResponseMs })}</span>
          </div>
          {result.error && <p className="mt-3 text-sm text-amber-400">{result.error}</p>}
          <ol className="mt-6 space-y-4">
            {result.hops.map((hop, i) => (
              <li key={`${hop.url}-${i}`} className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm break-all text-zinc-200">{hop.url}</p>
                    <dl className="mt-3 space-y-1 text-sm">
                      {hop.statusCode != null && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">{t('statusCode')}</dt>
                          <dd className="font-mono">{hop.statusCode}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{t('responseTime')}</dt>
                        <dd className="font-mono">{hop.responseMs} ms</dd>
                      </div>
                      {hop.location && (
                        <div>
                          <dt className="text-zinc-500">{t('location')}</dt>
                          <dd className="mt-1 flex items-center gap-1 font-mono text-xs text-blue-300 break-all">
                            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                            {hop.location}
                          </dd>
                        </div>
                      )}
                      {hop.error && <dd className="text-xs text-red-400">{hop.error}</dd>}
                    </dl>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {result.finalUrl && result.finalUrl !== result.startUrl && (
            <p className="mt-4 text-sm text-zinc-400">
              {t('finalUrl')}: <span className="font-mono text-zinc-200">{result.finalUrl}</span>
            </p>
          )}
          <p className="mt-6 text-xs text-zinc-500">
            <Link2 className="mr-1 inline h-3 w-3" aria-hidden />
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
