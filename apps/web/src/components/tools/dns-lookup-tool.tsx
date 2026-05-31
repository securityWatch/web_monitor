'use client';

import { useState } from 'react';
import { CheckCircle, Globe, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as const;

interface DNSResult {
  host: string;
  recordType: string;
  isUp: boolean;
  records: string[];
  responseMs: number;
  error?: string;
}

export function DnsLookupTool() {
  const t = useTranslations('extraTools.dnsLookup');
  const [host, setHost] = useState('');
  const [recordType, setRecordType] = useState<string>('A');
  const [result, setResult] = useState<DNSResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setLoading(true);
    setResult(null);
    setFetchError('');
    try {
      const params = new URLSearchParams({ host: host.trim(), type: recordType });
      const res = await fetch(`/api/v1/public/dns-lookup?${params}`);
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
      <form onSubmit={lookup} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <input
          className="input flex-1 font-mono text-sm"
          placeholder={t('placeholder')}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <select
          className="input shrink-0 font-mono text-sm sm:w-28"
          value={recordType}
          onChange={(e) => setRecordType(e.target.value)}
          aria-label={t('recordType')}
        >
          {RECORD_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {rt}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !host.trim()} className="btn-primary shrink-0 px-6">
          {loading ? t('looking') : t('lookup')}
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
              <p className="font-mono text-sm break-all">
                {result.host} <span className="text-zinc-500">({result.recordType})</span>
              </p>
              {result.records.length > 0 ? (
                <ul className="mt-4 space-y-1 font-mono text-sm text-zinc-300">
                  {result.records.map((r) => (
                    <li key={r} className="break-all">
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">{t('notFound')}</p>
              )}
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
            <Globe className="mr-1 inline h-3 w-3" aria-hidden />
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
