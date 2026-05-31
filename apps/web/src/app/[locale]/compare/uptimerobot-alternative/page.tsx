import { getTranslations } from 'next-intl/server';
import { buildPageMetadata } from '@/lib/seo';
import { CompareUptimeRobotContent } from '../uptimerobot/compare-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.compare.uptimerobotAlternative' });
  return buildPageMetadata({
    locale,
    path: '/compare/uptimerobot-alternative',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default function CompareUptimeRobotAlternativePage() {
  return <CompareUptimeRobotContent />;
}
