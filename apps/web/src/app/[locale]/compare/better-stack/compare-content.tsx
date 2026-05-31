'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';

const features = [
  { key: 'incidents', pw: true, bs: true },
  { key: 'screenshots', pw: true, bs: true },
  { key: 'onCall', pw: true, bs: true },
  { key: 'statusPage', pw: true, bs: true },
  { key: 'founding', pw: true, bs: false },
  { key: 'cnIm', pw: true, bs: false },
  { key: 'selfHost', pw: false, bs: false },
];

export function CompareBetterStackContent() {
  const t = useTranslations('compare.betterstack');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-4 text-zinc-400">{t('subtitle')}</p>

        <div className="mt-10 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-zinc-500">
              <tr>
                <th className="p-4">{t('feature')}</th>
                <th className="p-4">PulseWatch</th>
                <th className="p-4">Better Stack</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.key} className="border-t border-zinc-800">
                  <td className="p-4">{t(`features.${f.key}`)}</td>
                  <td className="p-4">{f.pw ? '✓' : '—'}</td>
                  <td className="p-4">{f.bs ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/register" className="btn-primary">{t('cta')}</Link>
          <Link href="/pricing#compare" className="btn-secondary">{t('pricing')}</Link>
        </div>
      </main>
    </div>
  );
}
