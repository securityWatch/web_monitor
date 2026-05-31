'use client';

import { useTranslations } from 'next-intl';
import { CheckMetadata } from '@/lib/check-metadata';
import { formatMs } from '@/lib/utils';

export function PageSpeedInsights({ meta }: { meta: CheckMetadata }) {
  const t = useTranslations('monitors');
  if (!meta.pageSpeed) return null;

  const phases = meta.navigationPhases?.filter((p) => p.durationMs > 0) || [];
  const maxPhase = Math.max(...phases.map((p) => p.durationMs), 1);
  const resources = meta.resourceInventory?.byType || {};
  const resourceRows = Object.entries(resources).filter(([, value]) => value > 0);

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('pagespeedInsightsTitle')}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t('pagespeedInsightsDesc')}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${meta.budgetStatus === 'fail' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {t('pagespeedScore', { score: meta.performanceScore ?? 100 })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={t('pagespeedTtfb')} value={formatMs(meta.timings?.ttfbMs)} budget={budget(meta.performanceBudgets?.maxTtfbMs)} warn={(meta.timings?.ttfbMs ?? 0) > (meta.performanceBudgets?.maxTtfbMs ?? Infinity)} />
        <Metric label={t('pagespeedFcp')} value={formatMs(meta.fcpMs)} />
        <Metric label={t('pagespeedLcp')} value={formatMs(meta.lcpMs)} budget={budget(meta.performanceBudgets?.maxLcpMs)} warn={(meta.lcpMs ?? 0) > (meta.performanceBudgets?.maxLcpMs ?? Infinity)} />
        <Metric label={t('pagespeedWeight')} value={formatBytes(meta.pageWeightBytes)} budget={meta.performanceBudgets?.maxPageWeightKb ? `${meta.performanceBudgets.maxPageWeightKb} KB` : undefined} warn={(meta.pageWeightBytes ?? 0) > (meta.performanceBudgets?.maxPageWeightKb ?? Infinity) * 1024} />
      </div>

      {meta.budgetViolations && meta.budgetViolations.length > 0 && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
          <p className="font-medium">{t('pagespeedBudgetViolations')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {meta.budgetViolations.map((v) => <li key={v}>{v}</li>)}
          </ul>
        </div>
      )}

      {phases.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium text-zinc-300">{t('pagespeedWaterfall')}</p>
          <div className="space-y-2">
            {phases.map((phase) => (
              <div key={phase.name} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-zinc-500">{t(`phase${capitalize(phase.name)}` as 'phaseDns')}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full rounded bg-blue-500" style={{ width: `${Math.max(3, (phase.durationMs / maxPhase) * 100)}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-zinc-300">{formatMs(phase.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-sm font-medium text-zinc-300">{t('pagespeedResourceInventory')}</p>
          <p className="mt-1 text-xs text-zinc-500">{t('pagespeedResourceTotal', { count: meta.resourceInventory?.total ?? 0 })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {resourceRows.length === 0 ? (
              <span className="text-xs text-zinc-500">{t('pagespeedNoResources')}</span>
            ) : resourceRows.map(([key, value]) => (
              <span key={key} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                {t(`resource${capitalize(key)}` as 'resourceScripts')}: {value}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-sm font-medium text-zinc-300">{t('pagespeedHtmlSnapshot')}</p>
          <p className="mt-3 font-mono text-lg">{formatBytes(meta.htmlBytes)}</p>
          <p className="mt-1 text-xs text-zinc-500">{t('pagespeedHtmlSnapshotDesc')}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, budget, warn }: { label: string; value: string; budget?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? 'border-red-900/60 bg-red-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg ${warn ? 'text-red-300' : 'text-zinc-100'}`}>{value}</p>
      {budget && <p className="mt-1 text-xs text-zinc-600">≤ {budget}</p>}
    </div>
  );
}

function budget(value?: number) {
  return value ? formatMs(value) : undefined;
}

function formatBytes(value?: number) {
  if (value == null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
