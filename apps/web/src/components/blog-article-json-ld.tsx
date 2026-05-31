import { getSiteUrl, localeUrl } from '@/lib/seo';

export function BlogArticleJsonLd({
  locale,
  slug,
  title,
  description,
  datePublished,
}: {
  locale: string;
  slug: string;
  title: string;
  description: string;
  datePublished: string;
}) {
  const url = localeUrl(locale, `/blog/${slug}`);
  const json = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished,
    author: { '@type': 'Organization', name: 'PulseWatch', url: getSiteUrl() },
    publisher: {
      '@type': 'Organization',
      name: 'PulseWatch',
      url: getSiteUrl(),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
