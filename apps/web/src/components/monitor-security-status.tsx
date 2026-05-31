'use client';

import { useTranslations } from 'next-intl';
import { SecurityCheckMetadata } from '@/lib/check-metadata';

interface Props {
  type: string;
  meta: SecurityCheckMetadata;
}

export function MonitorSecurityStatus({ type, meta }: Props) {
  const t = useTranslations('monitors');

  const hasSsl = meta.sslDaysLeft != null;
  const hasDns = meta.records && meta.records.length > 0;
  const hasTamper = meta.bodyHash || meta.diffPercent != null || meta.aiContentRecognition;

  if (!hasSsl && !hasDns && !hasTamper) return null;

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">{t('securityStatusTitle')}</h2>

      {(type === 'ssl' || hasSsl) && meta.sslDaysLeft != null && (
        <div className="rounded-lg border border-zinc-800 p-3 text-sm">
          <p className="font-medium text-zinc-300">{t('sslStatusTitle')}</p>
          <dl className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
            <div><dt className="inline">{t('sslDaysLeft')}: </dt><dd className="inline font-mono text-zinc-200">{meta.sslDaysLeft}</dd></div>
            {meta.sslExpiresAt && (
              <div><dt className="inline">{t('sslExpiresAt')}: </dt><dd className="inline font-mono text-zinc-200">{meta.sslExpiresAt}</dd></div>
            )}
            {meta.issuer && (
              <div><dt className="inline">{t('sslIssuer')}: </dt><dd className="inline text-zinc-200">{meta.issuer}</dd></div>
            )}
            {meta.tlsVersion && (
              <div><dt className="inline">{t('sslTlsVersion')}: </dt><dd className="inline font-mono text-zinc-200">{meta.tlsVersion}</dd></div>
            )}
          </dl>
        </div>
      )}

      {(type === 'dns' || hasDns) && meta.records && (
        <div className="rounded-lg border border-zinc-800 p-3 text-sm">
          <p className="font-medium text-zinc-300">{t('dnsStatusTitle')}</p>
          {meta.recordType && <p className="mt-1 text-xs text-zinc-500">{meta.recordType}</p>}
          <ul className="mt-2 list-inside list-disc font-mono text-xs text-zinc-300">
            {meta.records.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {meta.dnsChanged && (
            <p className="mt-2 text-xs text-amber-400">{t('dnsChangedAlert')}</p>
          )}
        </div>
      )}

      {(type === 'tamper' || hasTamper) && (
        <div className="rounded-lg border border-zinc-800 p-3 text-sm">
          <p className="font-medium text-zinc-300">{t('tamperStatusTitle')}</p>
          <dl className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
            {meta.diffPercent != null && (
              <div><dt className="inline">{t('tamperDiffPercent')}: </dt><dd className="inline font-mono text-zinc-200">{meta.diffPercent}%</dd></div>
            )}
            {meta.bodyHash && (
              <div className="sm:col-span-2"><dt>{t('tamperBodyHash')}: </dt><dd className="font-mono text-zinc-200 break-all">{meta.bodyHash.slice(0, 16)}…</dd></div>
            )}
          </dl>
          {meta.matchedKeywords && meta.matchedKeywords.length > 0 && (
            <p className="mt-2 text-xs text-red-400">{t('tamperMatchedKeywords')}: {meta.matchedKeywords.join(', ')}</p>
          )}
          {meta.diffSummary && (
            <p className="mt-2 text-xs text-zinc-400">{meta.diffSummary}</p>
          )}
          {meta.aiContentRecognition && (
            <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-xs">
              <p className="font-medium text-blue-100">{t('tamperAIStatusTitle')}</p>
              <p className={meta.aiContentRecognition.flagged ? 'mt-1 text-red-300' : 'mt-1 text-blue-100/70'}>
                {meta.aiContentRecognition.status === 'ok'
                  ? t(meta.aiContentRecognition.flagged ? 'tamperAIFlagged' : 'tamperAIClean')
                  : t('tamperAIUnavailable')}
                {meta.aiContentRecognition.riskLevel ? ` · ${meta.aiContentRecognition.riskLevel}` : ''}
              </p>
              {meta.aiContentRecognition.summary && (
                <p className="mt-1 text-blue-100/70">{meta.aiContentRecognition.summary}</p>
              )}
              {meta.aiContentRecognition.categories && meta.aiContentRecognition.categories.length > 0 && (
                <p className="mt-1 text-blue-100/60">{meta.aiContentRecognition.categories.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
