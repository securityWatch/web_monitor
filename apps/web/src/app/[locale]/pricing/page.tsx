import { PricingFaqJsonLd } from './pricing-faq-json-ld';
import { PricingPageClient } from './pricing-page-client';

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <PricingFaqJsonLd locale={locale} />
      <PricingPageClient />
    </>
  );
}
