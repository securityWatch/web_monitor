'use client';

import { MarketingNav } from '@/components/marketing-nav';
import { Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ToolShell({ children }: { children: React.ReactNode }) {
  const tc = useTranslations('common');
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main>{children}</main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        <p>© {new Date().getFullYear()} PulseWatch — {tc('tagline')}</p>
      </footer>
    </div>
  );
}

export function ToolHero({ badge, title, subtitle }: { badge: string; title: string; subtitle: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
        {badge}
      </div>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-zinc-400">{subtitle}</p>
    </div>
  );
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
