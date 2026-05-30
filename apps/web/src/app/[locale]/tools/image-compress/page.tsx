import { getTranslations } from 'next-intl/server';
import { ImageCompressTool } from '@/components/tools/image-compress-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.imageCompress' });
  return buildPageMetadata({ locale, path: '/tools/image-compress', title: t('title'), description: t('description'), keywords: t('keywords').split(',').map((k) => k.trim()) });
}

export default function Page() {
  return <ToolShell><ImageCompressTool /></ToolShell>;
}
