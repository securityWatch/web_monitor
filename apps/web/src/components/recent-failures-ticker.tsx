'use client';

import { Link } from '@/i18n/navigation';

interface RecentFailure {
  monitorId: string;
  monitorName: string;
  checkedAt: string;
  errorMessage?: string | null;
  statusCode?: number | null;
}

interface Props {
  items: RecentFailure[];
  emptyLabel: string;
}

export function RecentFailuresTicker({ items, emptyLabel }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-400">
        {emptyLabel}
      </div>
    );
  }

  const renderItem = (f: RecentFailure, i: number) => (
    <span key={`${f.monitorId}-${f.checkedAt}-${i}`} className="inline-flex items-center gap-2 px-6">
      <span className="text-red-400">●</span>
      <Link href={`/monitors/${f.monitorId}`} className="font-medium text-zinc-200 hover:text-blue-400">
        {f.monitorName}
      </Link>
      <span className="text-zinc-500">{new Date(f.checkedAt).toLocaleString()}</span>
      {f.statusCode != null && <span className="font-mono text-xs text-zinc-500">{f.statusCode}</span>}
      {f.errorMessage && <span className="max-w-md truncate text-red-300/80">{f.errorMessage}</span>}
    </span>
  );

  return (
    <div className="failure-ticker overflow-hidden rounded-lg border border-red-900/40 bg-red-950/20">
      <div className="failure-ticker-track py-2 text-sm">
        {items.map(renderItem)}
        {items.map((f, i) => renderItem(f, i + items.length))}
      </div>
    </div>
  );
}
