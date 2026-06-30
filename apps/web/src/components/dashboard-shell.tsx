'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { CommandPalette } from '@/components/command-palette';
import { clearStoredAuth, getStoredAuth } from '@/lib/api';
import { OrgSwitcher } from '@/components/org-switcher';
import { Activity, LayoutDashboard, Globe, AlertTriangle, Settings, Plus, LogOut, Radio, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const auth = getStoredAuth();
  const isAdmin = auth?.user?.isAdmin;

  const nav = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/monitors', label: t('monitors'), icon: Globe },
    { href: '/incidents', label: t('incidents'), icon: AlertTriangle },
    { href: '/status-pages', label: t('statusPages'), icon: Radio },
    ...(isAdmin ? [{ href: '/admin', label: t('admin'), icon: Shield }] : []),
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  const logout = () => {
    clearStoredAuth();
    router.push('/login');
  };

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-[#0A0A0B]">
      <CommandPalette />
      <aside className="hidden w-60 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 p-4 md:block">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2 font-semibold text-white">
          <Activity className="h-5 w-5 text-blue-500" />
          {tc('appName')}
        </Link>
        <nav className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive(item.href) ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="mt-8 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-white">
          <LogOut className="h-4 w-4" /> {t('logout')}
        </button>
      </aside>
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <div className="md:hidden font-semibold">{tc('appName')}</div>
          <div className="ml-auto flex items-center gap-3">
            <LanguageToggle />
            <OrgSwitcher />
            <Link href="/monitors/new" className="btn-primary flex items-center gap-1 text-xs sm:text-sm">
              <Plus className="h-4 w-4" /> <span className="hidden xs:inline">{t('addMonitor')}</span>
            </Link>
            <span className="hidden text-sm text-zinc-500 lg:block">{auth?.user.email}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden"
        aria-label={t('mobileNav')}
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors',
              isActive(item.href) ? 'text-blue-400' : 'text-zinc-500'
            )}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
