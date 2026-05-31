import { getTranslations } from 'next-intl/server';
import { getSiteUrl, localeUrl } from '@/lib/seo';

const FAQ_COUNT = 16;

export async function LandingJsonLd({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  const base = getSiteUrl();
  const pageUrl = localeUrl(locale);

  const faqEntities = Array.from({ length: FAQ_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      '@type': 'Question',
      name: t(`faq${n}Q`),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(`faq${n}A`),
      },
    };
  });

  const graph = [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: 'PulseWatch',
      url: base,
      logo: `${base}/favicon.ico`,
      description: t('jsonLdOrgDescription'),
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      name: 'PulseWatch',
      url: base,
      inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
      publisher: { '@id': `${base}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: t('jsonLdPageName'),
      description: t('jsonLdPageDescription'),
      isPartOf: { '@id': `${base}/#website` },
      inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
    },
    {
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      mainEntity: faqEntities,
    },
  ];

  const json = {
    '@context': 'https://schema.org',
    '@graph': graph,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
