import { getTranslations } from 'next-intl/server';
import { MarketingNav } from '@/components/marketing-nav';
import { DevToolsPanel } from '@/components/dev-tools-panel';
import { buildPageMetadata } from '@/lib/seo';
import { Activity } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.tools' });
  const keywords = t('keywords')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return buildPageMetadata({
    locale,
    path: '/tools',
    title: t('title'),
    description: t('description'),
    keywords,
  });
}

export default async function DevToolsPage() {
  const tc = await getTranslations('common');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main>
        <DevToolsPanel />
      </main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        <p>© {new Date().getFullYear()} PulseWatch — {tc('tagline')}</p>
      </footer>
    </div>
  );
}
