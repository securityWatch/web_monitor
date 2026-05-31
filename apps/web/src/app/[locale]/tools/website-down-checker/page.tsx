import { getTranslations } from 'next-intl/server';
import { WebsiteDownCheckerTool } from '@/components/tools/website-down-checker-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.websiteDownChecker' });
  return buildPageMetadata({
    locale,
    path: '/tools/website-down-checker',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default function Page() {
  return (
    <ToolShell>
      <WebsiteDownCheckerTool />
    </ToolShell>
  );
}
