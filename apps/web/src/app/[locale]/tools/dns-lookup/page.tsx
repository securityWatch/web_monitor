import { getTranslations } from 'next-intl/server';
import { DnsLookupTool } from '@/components/tools/dns-lookup-tool';
import { ToolShell } from '@/components/tools/tool-shell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.dnsLookup' });
  return buildPageMetadata({
    locale,
    path: '/tools/dns-lookup',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default function Page() {
  return (
    <ToolShell>
      <DnsLookupTool />
    </ToolShell>
  );
}
