import type { MetadataRoute } from 'next';
import { publicMarketingPaths, localeUrl } from '@/lib/seo';
import { routing } from '@/i18n/routing';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const path of publicMarketingPaths) {
    for (const locale of routing.locales) {
      entries.push({
        url: localeUrl(locale, path),
        lastModified: now,
        changeFrequency: path === '' ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : path === '/pricing' ? 0.9 : 0.7,
        alternates: {
          languages: {
            en: localeUrl('en', path),
            zh: localeUrl('zh', path),
            'x-default': localeUrl(routing.defaultLocale, path),
          },
        },
      });
    }
  }

  return entries;
}
