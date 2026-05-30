'use client';

import { useTranslations } from 'next-intl';
import { PageSpeedMonitorConfig } from '@/lib/monitor-config';

interface Props {
  config: PageSpeedMonitorConfig;
  onChange: (config: PageSpeedMonitorConfig) => void;
}

export function MonitorPageSpeedConfig({ config, onChange }: Props) {
  const t = useTranslations('monitors');
  const update = (key: keyof PageSpeedMonitorConfig, value: number) => {
    onChange({ ...config, [key]: value > 0 ? value : undefined });
  };

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
      <div>
        <p className="text-sm font-medium text-zinc-300">{t('pagespeedConfigTitle')}</p>
        <p className="mt-1 text-xs text-zinc-500">{t('pagespeedConfigDesc')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label={t('pagespeedMaxTtfb')} value={config.maxTtfbMs ?? 2000} suffix="ms" onChange={(v) => update('maxTtfbMs', v)} />
        <NumberField label={t('pagespeedMaxLcp')} value={config.maxLcpMs ?? 2500} suffix="ms" onChange={(v) => update('maxLcpMs', v)} />
        <NumberField label={t('pagespeedMaxTotal')} value={config.maxTotalMs ?? 5000} suffix="ms" onChange={(v) => update('maxTotalMs', v)} />
        <NumberField label={t('pagespeedMaxWeight')} value={config.maxPageWeightKb ?? 2048} suffix="KB" onChange={(v) => update('maxPageWeightKb', v)} />
      </div>
    </div>
  );
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-400">{label}</span>
      <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950">
        <input
          type="number"
          min={1}
          className="w-full bg-transparent px-3 py-2 font-mono text-sm outline-none"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="px-3 text-xs text-zinc-500">{suffix}</span>
      </div>
    </label>
  );
}
