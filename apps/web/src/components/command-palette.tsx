'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { Search } from 'lucide-react';

type MonitorRow = { id: string; name: string };

export function CommandPalette() {
  const t = useTranslations('commandPalette');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const auth = getStoredAuth();
    if (!auth?.organization.id) return;
    apiFetch<{ monitors: MonitorRow[] }>(`/api/v1/orgs/${auth.organization.id}/monitors`)
      .then((d) => setMonitors(d.monitors || []))
      .catch(() => setMonitors([]));
  }, [open]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery('');
      router.push(path);
    },
    [router]
  );

  const filtered = monitors.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const pages = [
    { href: '/dashboard', label: t('dashboard') },
    { href: '/monitors', label: t('monitors') },
    { href: '/incidents', label: t('incidents') },
    { href: '/on-call', label: t('onCall') },
    { href: '/settings', label: t('settings') },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('title')}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">Esc</kbd>
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {pages.map((p) => (
            <button
              key={p.href}
              type="button"
              onClick={() => go(p.href)}
              className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {p.label}
            </button>
          ))}
          {filtered.length > 0 && (
            <>
              <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{t('monitors')}</p>
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => go(`/monitors/${m.id}`)}
                  className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  {m.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
