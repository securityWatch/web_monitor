import { getTranslations } from 'next-intl/server';
import { UptimeCalculatorTool } from '@/components/tools/uptime-calculator-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.uptimeCalculator' });
  return buildPageMetadata({
    locale,
    path: '/tools/uptime-calculator',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ToolShell>
      <UptimeCalculatorTool locale={locale} />
    </ToolShell>
  );
}
