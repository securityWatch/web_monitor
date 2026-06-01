import { getTranslations } from 'next-intl/server';
import { BadgeGeneratorTool } from '@/components/tools/badge-generator-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.badgeGenerator' });
  return buildPageMetadata({
    locale,
    path: '/tools/badge-generator',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default function Page() {
  return (
    <ToolShell>
      <BadgeGeneratorTool />
    </ToolShell>
  );
}
