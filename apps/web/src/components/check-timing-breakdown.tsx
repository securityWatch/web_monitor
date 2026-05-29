'use client';

import { useTranslations } from 'next-intl';
import { CheckTimings, timingRows } from '@/lib/check-metadata';
import { formatMs } from '@/lib/utils';

export function TimingBreakdown({ timings, compact }: { timings?: CheckTimings; compact?: boolean }) {
  const t = useTranslations('monitors');
  const rows = timingRows(timings);
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.value || 0), 1);

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-zinc-500">{t(row.labelKey)}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full rounded bg-blue-500/80"
              style={{ width: `${Math.max(4, ((row.value || 0) / max) * 100)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-zinc-300">{formatMs(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
