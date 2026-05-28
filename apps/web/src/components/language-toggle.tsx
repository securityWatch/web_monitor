'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTransition } from 'react';
import { apiFetch, getStoredAuth, setStoredAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const switchLocale = (next: 'en' | 'zh') => {
    if (next === locale) return;
    startTransition(async () => {
      document.cookie = `PULSEWATCH_LOCALE=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      const auth = getStoredAuth();
      if (auth?.accessToken) {
        try {
          await apiFetch('/api/v1/me/profile', {
            method: 'PATCH',
            body: JSON.stringify({ locale: next }),
          });
          setStoredAuth({ ...auth, user: { ...auth.user, locale: next } });
        } catch {
          /* ignore if not logged in */
        }
      }
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5 text-xs font-medium',
        pending && 'opacity-60',
        className
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => switchLocale('en')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-colors',
          locale === 'en' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => switchLocale('zh')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-colors',
          locale === 'zh' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
        )}
      >
        中文
      </button>
    </div>
  );
}
