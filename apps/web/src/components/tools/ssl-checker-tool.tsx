'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

interface SSLResult {
  host: string;
  valid: boolean;
  issuer?: string;
  subject?: string;
  expiresAt?: string;
  daysLeft?: number;
  tlsVersion?: string;
  error?: string;
}

export function SslCheckerTool() {
  const t = useTranslations('extraTools.ssl');
  const [host, setHost] = useState('');
  const [result, setResult] = useState<SSLResult | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/public/ssl-check?host=${encodeURIComponent(host.trim())}`);
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <form onSubmit={check} className="mt-10 flex gap-2">
        <input
          className="input flex-1 font-mono"
          placeholder={t('placeholder')}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <button type="submit" disabled={loading} className="btn-primary px-6">
          {loading ? '...' : t('check')}
        </button>
      </form>
      {result && (
        <div className={`mt-6 card ${result.valid ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${result.valid ? 'text-emerald-400' : 'text-red-400'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{result.host}</p>
              <p className={result.valid ? 'text-emerald-400' : 'text-red-400'}>
                {result.valid ? t('valid') : t('invalid')}
              </p>
              {result.error && <p className="mt-2 text-sm text-zinc-500">{result.error}</p>}
              {result.expiresAt && (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{t('expires')}</dt>
                    <dd>{result.expiresAt}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{t('daysLeft')}</dt>
                    <dd>{result.daysLeft}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{t('issuer')}</dt>
                    <dd className="text-right">{result.issuer}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{t('tls')}</dt>
                    <dd>{result.tlsVersion}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-6 text-xs text-zinc-600">
                {t('cta')}{' '}
                <Link href="/register" className="text-blue-400 hover:underline">
                  {t('ctaLink')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
