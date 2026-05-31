import { getTranslations } from 'next-intl/server';
import { PdfOrganizerTool } from '@/components/tools/pdf-organizer-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pdfTools' });
  return buildPageMetadata({ locale, path: '/tools/pdf-tools', title: t('title'), description: t('description'), keywords: t('keywords').split(',').map((k) => k.trim()) });
}

export default function Page() {
  return <ToolShell><PdfOrganizerTool /></ToolShell>;
}
