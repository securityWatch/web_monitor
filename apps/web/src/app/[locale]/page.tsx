import { getTranslations } from 'next-intl/server';
import { LandingPage } from '@/components/landing-page';
import { LandingJsonLd } from '@/components/landing-json-ld';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  const keywords = t('keywords')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return buildPageMetadata({
    locale,
    path: '',
    title: t('title'),
    description: t('description'),
    keywords,
  });
}

async function getFoundingCount() {
  try {
    const base = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${base}/api/v1/public/founding-count`, {
      next: { revalidate: 60 },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data.remaining as number;
    }
  } catch {
    /* ignore */
  }
  return 3847;
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const foundingCount = await getFoundingCount();
  return (
    <>
      <LandingJsonLd locale={locale} />
      <LandingPage foundingCount={foundingCount} />
    </>
  );
}
