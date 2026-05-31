import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/monitors',
          '/*/dashboard',
          '/*/settings',
          '/*/incidents',
          '/*/on-call',
          '/*/onboarding',
          '/*/status-pages',
          '/*/verify-email',
          '/*/auth/',
          '/*/reset-password',
          '/*/forgot-password',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
