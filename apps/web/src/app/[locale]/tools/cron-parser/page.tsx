import { getTranslations } from 'next-intl/server';
import { CronParserTool } from '@/components/tools/cron-parser-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.cronParser' });
  return buildPageMetadata({ locale, path: '/tools/cron-parser', title: t('title'), description: t('description'), keywords: t('keywords').split(',').map((k) => k.trim()) });
}

export default function Page() {
  return <ToolShell><CronParserTool /></ToolShell>;
}
