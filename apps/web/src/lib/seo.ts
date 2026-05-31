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
  '/features/uptime-monitoring',
  '/features/ssl-monitoring',
  '/features/status-pages',
  '/features/alerting',
  '/compare/better-stack',
  '/compare/uptimerobot',
  '/use-cases/api-monitoring',
  '/use-cases/ecommerce-uptime',
  '/blog',
  '/blog/how-to-monitor-api-uptime',
  '/blog/website-down-checker-guide',
  '/blog/ssl-certificate-monitoring-guide',
  '/blog/downtime-cost-calculator-guide',
  '/tools',
  '/tools/uptime-calculator',
  '/tools/website-down-checker',
  '/tools/image-compress',
  '/tools/pdf-tools',
  '/tools/pdf-to-word',
  '/tools/qr-code',
  '/tools/jwt-decoder',
  '/tools/cron-parser',
  '/tools/ssl-checker',
  '/tools/dns-lookup',
  '/tools/ping-test',
  '/tools/port-checker',
  '/tools/http-headers',
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
  const ogImage = `${getSiteUrl()}/opengraph-image.png`;
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'PulseWatch' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/** Metadata for authenticated app routes (dashboard, monitors, etc.). */
export function privateAppMetadata(title?: string): Metadata {
  return {
    title: title ? `${title} | PulseWatch` : 'PulseWatch',
    robots: { index: false, follow: false },
  };
}
