import { getTranslations } from 'next-intl/server';
import { Activity } from 'lucide-react';
import { MarketingNav } from '@/components/marketing-nav';
import { PdfToWordTool } from '@/components/pdf-to-word-tool';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pdfToWord' });
  return buildPageMetadata({
    locale,
    path: '/tools/pdf-to-word',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()).filter(Boolean),
  });
}

export default async function PdfToWordPage() {
  const tc = await getTranslations('common');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main>
        <PdfToWordTool />
      </main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        <p>© {new Date().getFullYear()} PulseWatch — {tc('tagline')}</p>
      </footer>
    </div>
  );
}
