import { getTranslations } from 'next-intl/server';
import { QrCodeTool } from '@/components/tools/qr-code-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.qrCode' });
  return buildPageMetadata({ locale, path: '/tools/qr-code', title: t('title'), description: t('description'), keywords: t('keywords').split(',').map((k) => k.trim()) });
}

export default function Page() {
  return <ToolShell><QrCodeTool /></ToolShell>;
}
