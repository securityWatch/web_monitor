'use client';

import { useTranslations } from 'next-intl';
import { DnsMonitorConfig } from '@/lib/monitor-config';

interface Props {
  config: DnsMonitorConfig;
  onChange: (config: DnsMonitorConfig) => void;
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX'];

export function MonitorDnsConfig({ config, onChange }: Props) {
  const t = useTranslations('monitors');

  return (
    <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
      <p className="text-sm font-medium text-zinc-300">{t('dnsConfigTitle')}</p>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('dnsRecordType')}</label>
        <select
          className="input"
          value={config.recordType || 'A'}
          onChange={(e) => onChange({ ...config, recordType: e.target.value })}
        >
          {RECORD_TYPES.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('dnsBaselineMode')}</label>
        <select
          className="input"
          value={config.baselineMode || 'auto'}
          onChange={(e) => onChange({ ...config, baselineMode: e.target.value as 'auto' | 'manual' })}
        >
          <option value="auto">{t('dnsBaselineAuto')}</option>
          <option value="manual">{t('dnsBaselineManual')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('dnsExpectedValue')}</label>
        <input
          className="input font-mono text-sm"
          placeholder="203.0.113.1"
          value={config.expectedValue || ''}
          onChange={(e) => onChange({ ...config, expectedValue: e.target.value })}
        />
        <p className="mt-1 text-xs text-zinc-500">{t('dnsExpectedHint')}</p>
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('dnsTrustedResolvers')}</label>
        <input
          className="input font-mono text-sm"
          placeholder="1.1.1.1, 8.8.8.8"
          value={config.trustedResolvers || ''}
          onChange={(e) => onChange({ ...config, trustedResolvers: e.target.value })}
        />
        <p className="mt-1 text-xs text-zinc-500">{t('dnsTrustedResolversHint')}</p>
      </div>
    </div>
  );
}
