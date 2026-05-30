import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

/** Public site origin (no trailing slash). Used for canonical, sitemap, JSON-LD. */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://49.234.112.108';
  return raw.replace(/\/$/, '');
}

export function localeUrl(locale: string, path = ''): string {
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `${getSiteUrl()}/${locale}${suffix}`;
}

export function hreflangAlternates(path = ''): Record<string, string> {
  const languages: Record<string, string> = {
    'x-default': localeUrl(routing.defaultLocale, path),
  };
  for (const locale of routing.locales) {
    languages[locale] = localeUrl(locale, path);
  }
  return languages;
}

export const publicMarketingPaths = [
  '',
  '/login',
  '/register',
  '/pricing',
  '/compare/better-stack',
  '/compare/uptimerobot',
  '/tools',
  '/tools/image-compress',
  '/tools/pdf-tools',
  '/tools/pdf-to-word',
  '/tools/qr-code',
  '/tools/jwt-decoder',
  '/tools/cron-parser',
  '/tools/ssl-checker',
] as const;

export function buildPageMetadata(opts: {
  locale: string;
  path?: string;
  title: string;
  description: string;
  keywords?: string[];
}): Metadata {
  const path = opts.path ?? '';
  const canonical = localeUrl(opts.locale, path);
  return {
    title: opts.title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: {
      canonical,
      languages: hreflangAlternates(path),
    },
    openGraph: {
      type: 'website',
      locale: opts.locale === 'zh' ? 'zh_CN' : 'en_US',
      url: canonical,
      siteName: 'PulseWatch',
      title: opts.title,
      description: opts.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
