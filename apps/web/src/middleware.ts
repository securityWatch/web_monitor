import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { isAppHost, safeHost } from './lib/app-domains';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() || '';
  const siteHost = safeHost(process.env.NEXT_PUBLIC_SITE_URL);
  const pathname = request.nextUrl.pathname;
  const isPrimaryHost =
    !host ||
    host === siteHost ||
    isAppHost(host) ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '49.234.112.108';

  if (!isPrimaryHost && (pathname === '/' || pathname === '/en' || pathname === '/zh')) {
    const locale = pathname === '/zh' ? 'zh' : 'en';
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/status/domain/${encodeURIComponent(host)}`;
    return NextResponse.rewrite(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*'],
};
