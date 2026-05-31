'use client';

import { useMemo, useState } from 'react';
import { Calculator, DollarSign, TrendingDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';

const HOURS_PER_YEAR = 8760;

function parseNumber(value: string, fallback: number): number {
  const n = parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(hours);
}

export function UptimeCalculatorTool({ locale }: { locale: string }) {
  const t = useTranslations('extraTools.uptimeCalculator');
  const [uptime, setUptime] = useState('99.9');
  const [monthlyRevenue, setMonthlyRevenue] = useState('50000');
  const [incidents, setIncidents] = useState('4');
  const [avgDowntimeMinutes, setAvgDowntimeMinutes] = useState('45');

  const result = useMemo(() => {
    const uptimePct = Math.min(100, Math.max(0, parseNumber(uptime, 99.9)));
    const revenue = parseNumber(monthlyRevenue, 0);
    const incidentCount = Math.max(0, parseNumber(incidents, 0));
    const avgMinutes = Math.max(0, parseNumber(avgDowntimeMinutes, 0));

    const downtimePct = 100 - uptimePct;
    const slaDowntimeHours = (downtimePct / 100) * HOURS_PER_YEAR;
    const revenuePerHour = revenue > 0 ? (revenue * 12) / HOURS_PER_YEAR : 0;
    const slaCost = slaDowntimeHours * revenuePerHour;

    const incidentDowntimeHours = incidentCount > 0 ? (incidentCount * avgMinutes) / 60 : 0;
    const incidentCost = incidentDowntimeHours * revenuePerHour;
    const costPerIncident = incidentCount > 0 ? incidentCost / incidentCount : 0;

    return {
      uptimePct,
      downtimePct,
      slaDowntimeHours,
      slaCost,
      incidentDowntimeHours,
      incidentCost,
      costPerIncident,
      revenuePerHour,
    };
  }, [uptime, monthlyRevenue, incidents, avgDowntimeMinutes]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-10 card border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-300">{t('uptimeLabel')}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input mt-2 w-full font-mono"
              value={uptime}
              onChange={(e) => setUptime(e.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">{t('uptimeHint')}</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">{t('revenueLabel')}</span>
            <input
              type="number"
              min={0}
              step={1000}
              className="input mt-2 w-full font-mono"
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">{t('revenueHint')}</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">{t('incidentsLabel')}</span>
            <input
              type="number"
              min={0}
              step={1}
              className="input mt-2 w-full font-mono"
              value={incidents}
              onChange={(e) => setIncidents(e.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">{t('incidentsHint')}</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">{t('avgDowntimeLabel')}</span>
            <input
              type="number"
              min={0}
              step={5}
              className="input mt-2 w-full font-mono"
              value={avgDowntimeMinutes}
              onChange={(e) => setAvgDowntimeMinutes(e.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">{t('avgDowntimeHint')}</span>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card border-blue-500/30 bg-blue-500/5">
          <div className="flex items-center gap-2 text-blue-300">
            <Calculator className="h-5 w-5" aria-hidden />
            <h2 className="font-semibold">{t('slaResultTitle')}</h2>
          </div>
          <p className="mt-4 text-3xl font-bold font-mono text-white">
            {formatCurrency(result.slaCost, locale)}
            <span className="text-base font-normal text-zinc-400"> / {t('perYear')}</span>
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t('downtimePercent')}</dt>
              <dd className="font-mono">{result.downtimePct.toFixed(3)}%</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t('downtimeHours')}</dt>
              <dd className="font-mono">{formatHours(result.slaDowntimeHours, locale)} h</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t('revenuePerHour')}</dt>
              <dd className="font-mono">{formatCurrency(result.revenuePerHour, locale)}</dd>
            </div>
          </dl>
        </div>

        <div className="card border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-300">
            <TrendingDown className="h-5 w-5" aria-hidden />
            <h2 className="font-semibold">{t('incidentResultTitle')}</h2>
          </div>
          <p className="mt-4 text-3xl font-bold font-mono text-white">
            {formatCurrency(result.incidentCost, locale)}
            <span className="text-base font-normal text-zinc-400"> / {t('perYear')}</span>
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t('totalIncidentHours')}</dt>
              <dd className="font-mono">{formatHours(result.incidentDowntimeHours, locale)} h</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t('costPerIncident')}</dt>
              <dd className="font-mono">{formatCurrency(result.costPerIncident, locale)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 card border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-start gap-3">
          <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm text-zinc-300">{t('insight')}</p>
            <p className="mt-3 text-xs text-zinc-500">
              {t('cta')}{' '}
              <Link href="/register" className="text-blue-400 hover:underline">
                {t('ctaLink')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
