'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { clearStoredAuth, getStoredAuth } from '@/lib/api';
import { OrgSwitcher } from '@/components/org-switcher';
import { Activity, LayoutDashboard, Globe, AlertTriangle, Settings, Plus, LogOut, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const auth = getStoredAuth();

  const nav = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/monitors', label: t('monitors'), icon: Globe },
    { href: '/incidents', label: t('incidents'), icon: AlertTriangle },
    { href: '/status-pages', label: t('statusPages'), icon: Radio },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  const logout = () => {
    clearStoredAuth();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#0A0A0B]">
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
                pathname.startsWith(item.href) ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
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
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <div className="md:hidden font-semibold">{tc('appName')}</div>
          <div className="ml-auto flex items-center gap-3">
            <LanguageToggle />
            <OrgSwitcher />
            <Link href="/monitors/new" className="btn-primary flex items-center gap-1 text-xs sm:text-sm">
              <Plus className="h-4 w-4" /> {t('addMonitor')}
            </Link>
            <span className="hidden text-sm text-zinc-500 lg:block">{auth?.user.email}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
