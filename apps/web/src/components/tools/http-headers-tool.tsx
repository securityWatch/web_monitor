'use client';

import { useState } from 'react';
import { FileCode, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

interface HttpHeadersResult {
  url: string;
  isUp: boolean;
  statusCode?: number;
  responseMs: number;
  headers: Record<string, string[]>;
  error?: string;
}

export function HttpHeadersTool() {
  const t = useTranslations('extraTools.httpHeaders');
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<HttpHeadersResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setFetchError('');
    try {
      const res = await fetch(`/api/v1/public/http-headers?url=${encodeURIComponent(url.trim())}`);
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

  const headerEntries = result
    ? Object.entries(result.headers).sort(([a], [b]) => a.localeCompare(b))
    : [];

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
        <div className="mt-6 card">
          <p className="font-mono text-sm break-all">{result.url}</p>
          <dl className="mt-4 flex flex-wrap gap-6 text-sm">
            {result.statusCode != null && (
              <div>
                <dt className="text-zinc-500">{t('statusCode')}</dt>
                <dd className="font-mono">{result.statusCode}</dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500">{t('responseTime')}</dt>
              <dd className="font-mono">{result.responseMs} ms</dd>
            </div>
          </dl>
          {result.error && (
            <p className="mt-4 text-sm text-red-400 break-words">{result.error}</p>
          )}
          {headerEntries.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 bg-zinc-900/60">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-400">{t('headerName')}</th>
                    <th className="px-3 py-2 font-medium text-zinc-400">{t('headerValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {headerEntries.map(([name, values]) => (
                    <tr key={name} className="border-b border-zinc-800/60 last:border-0">
                      <td className="px-3 py-2 align-top font-mono text-blue-300">{name}</td>
                      <td className="px-3 py-2 font-mono text-zinc-300 break-all">
                        {values.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-6 text-xs text-zinc-500">
            <FileCode className="mr-1 inline h-3 w-3" aria-hidden />
            {t('cta')}{' '}
            <Link href="/register" className="text-blue-400 hover:underline">
              {t('ctaLink')}
            </Link>
          </p>
        </div>
      )}
      {!result && (
        <p className="mt-8 text-xs text-zinc-500">
          <Globe className="mr-1 inline h-3 w-3" aria-hidden />
          {t('hint')}
        </p>
      )}
    </div>
  );
}
