'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageToggle } from './language-toggle';
import { Activity } from 'lucide-react';

export function MarketingNav() {
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0A0A0B]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white">
          <Activity className="h-5 w-5 text-blue-500" />
          {tc('appName')}
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
          <a href="#features" className="hover:text-white transition-colors">{t('features')}</a>
          <Link href="/pricing" className="hover:text-white transition-colors">{t('pricing')}</Link>
          <Link href="/tools/ssl-checker" className="hover:text-white transition-colors">SSL Checker</Link>
        </nav>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link href="/login" className="hidden text-sm text-zinc-300 hover:text-white sm:block">
            {t('login')}
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            {t('signup')}
          </Link>
        </div>
      </div>
    </header>
  );
}
