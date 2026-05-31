import { getTranslations } from 'next-intl/server';
import { localeUrl } from '@/lib/seo';

const FAQ_COUNT = 4;

export async function PricingFaqJsonLd({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'pricingPage' });
  const pageUrl = localeUrl(locale, '/pricing');

  const mainEntity = Array.from({ length: FAQ_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      '@type': 'Question',
      name: t(`faq${n}Q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq${n}A`) },
    };
  });

  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
