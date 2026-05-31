import { getTranslations } from 'next-intl/server';
import { HttpHeadersTool } from '@/components/tools/http-headers-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.httpHeaders' });
  return buildPageMetadata({
    locale,
    path: '/tools/http-headers',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default function Page() {
  return (
    <ToolShell>
      <HttpHeadersTool />
    </ToolShell>
  );
}
