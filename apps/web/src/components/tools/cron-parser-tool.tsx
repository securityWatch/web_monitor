'use client';

import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ToolHero } from '@/components/tools/tool-shell';

export function CronParserTool() {
  const t = useTranslations('extraTools.cron');
  const [expr, setExpr] = useState('*/5 * * * *');
  const parsed = useMemo(() => parseCron(expr), [expr]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <label className="text-sm text-zinc-400">{t('expression')}<input className="input mt-2 font-mono" value={expr} onChange={(e) => setExpr(e.target.value)} /></label>
        {parsed.error ? <p className="mt-4 text-sm text-red-400">{parsed.error}</p> : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-sm text-zinc-400">{t('summary')}</p><p className="mt-2 text-zinc-200">{parsed.summary}</p></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-sm text-zinc-400">{t('next')}</p><ul className="mt-2 space-y-1 font-mono text-sm text-zinc-300">{parsed.next.map((d) => <li key={d}>{d}</li>)}</ul></div>
          </div>
        )}
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-500"><CalendarClock className="h-4 w-4" />{t('note')}</p>
      </div>
    </div>
  );
}

function parseCron(expr: string): { summary: string; next: string[]; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { summary: '', next: [], error: 'Expected 5 fields: minute hour day month weekday' };
  const [min, hour, day, month, weekday] = parts;
  const minutes = expand(min, 0, 59);
  const hours = expand(hour, 0, 23);
  const days = expand(day, 1, 31);
  const months = expand(month, 1, 12);
  const weekdays = expand(weekday, 0, 6);
  if (!minutes || !hours || !days || !months || !weekdays) return { summary: '', next: [], error: 'Unsupported or invalid cron field' };
  const next: string[] = [];
  const cursor = new Date(Date.now() + 60_000);
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 525600 && next.length < 5; i++) {
    if (minutes.has(cursor.getMinutes()) && hours.has(cursor.getHours()) && days.has(cursor.getDate()) && months.has(cursor.getMonth() + 1) && weekdays.has(cursor.getDay())) {
      next.push(cursor.toLocaleString());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return { summary: `minute=${min}, hour=${hour}, day=${day}, month=${month}, weekday=${weekday}`, next };
}

function expand(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) out.add(i);
      continue;
    }
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      if (!step) return null;
      for (let i = min; i <= max; i += step) out.add(i);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (a < min || b > max || a > b) return null;
      for (let i = a; i <= b; i++) out.add(i);
      continue;
    }
    const n = Number(part);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    out.add(n);
  }
  return out;
}
