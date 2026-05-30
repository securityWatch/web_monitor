'use client';

import { useTranslations } from 'next-intl';
import { SslMonitorConfig } from '@/lib/monitor-config';

interface Props {
  config: SslMonitorConfig;
  onChange: (config: SslMonitorConfig) => void;
}

export function MonitorSslConfig({ config, onChange }: Props) {
  const t = useTranslations('monitors');

  return (
    <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
      <p className="text-sm font-medium text-zinc-300">{t('sslConfigTitle')}</p>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('sslWarnDays')}</label>
        <input
          type="number"
          min={1}
          max={365}
          className="input"
          value={config.warnDays ?? 30}
          onChange={(e) => onChange({ ...config, warnDays: Number(e.target.value) || 30 })}
        />
        <p className="mt-1 text-xs text-zinc-500">{t('sslWarnDaysHint')}</p>
      </div>
    </div>
  );
}
