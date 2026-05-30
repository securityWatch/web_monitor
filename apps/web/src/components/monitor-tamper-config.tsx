'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { TamperMonitorConfig } from '@/lib/monitor-config';

interface Props {
  monitorId?: string;
  config: TamperMonitorConfig;
  onChange: (config: TamperMonitorConfig) => void;
}

export function MonitorTamperConfig({ monitorId, config, onChange }: Props) {
  const t = useTranslations('monitors');
  const auth = getStoredAuth();
  const orgId = auth?.organization.id;
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState('');

  const updatePolicy = (key: 'gambling' | 'adult', checked: boolean) => {
    onChange({
      ...config,
      policyCategories: { ...config.policyCategories, [key]: checked },
      contentScanConsent: checked ? (config.contentScanConsent ?? true) : config.contentScanConsent,
    });
  };

  const updateAIRecognition = (checked: boolean) => {
    onChange({
      ...config,
      aiContentRecognitionEnabled: checked,
      contentScanConsent: checked ? true : config.contentScanConsent,
    });
  };

  const captureBaseline = async () => {
    if (!monitorId || !orgId) return;
    setCapturing(true);
    setCaptureMsg('');
    try {
      await apiFetch(`/api/v1/orgs/${orgId}/monitors/${monitorId}/baseline`, { method: 'POST' });
      setCaptureMsg(t('tamperBaselineCaptured'));
    } catch (err) {
      setCaptureMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setCapturing(false);
    }
  };

  const policyOn = config.policyCategories?.gambling || config.policyCategories?.adult;
  const scanOn = policyOn || config.aiContentRecognitionEnabled;

  return (
    <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
      <p className="text-sm font-medium text-zinc-300">{t('tamperConfigTitle')}</p>

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={!!config.aiContentRecognitionEnabled}
            onChange={(e) => updateAIRecognition(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium text-blue-100">{t('tamperAIRecognitionTitle')}</span>
            <span className="mt-1 block text-xs leading-relaxed text-blue-100/70">{t('tamperAIRecognitionDesc')}</span>
          </span>
        </label>
        <p className="mt-2 text-xs text-blue-100/60">{t('tamperAIIntervalHint')}</p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('tamperSensitivity')}</label>
        <input
          type="range"
          min={1}
          max={50}
          className="w-full"
          value={config.changeThresholdPercent ?? 10}
          onChange={(e) => onChange({ ...config, changeThresholdPercent: Number(e.target.value) })}
        />
        <p className="text-xs text-zinc-500">{t('tamperSensitivityValue', { pct: config.changeThresholdPercent ?? 10 })}</p>
      </div>

      {monitorId && (
        <div>
          <button type="button" className="btn-secondary text-sm" disabled={capturing} onClick={captureBaseline}>
            {capturing ? '...' : t('tamperRecaptureBaseline')}
          </button>
          {captureMsg && <p className="mt-1 text-xs text-zinc-400">{captureMsg}</p>}
        </div>
      )}

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <p className="text-sm text-zinc-400">{t('tamperCategories')}</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.detectMajorChange !== false}
            onChange={(e) => onChange({ ...config, detectMajorChange: e.target.checked })}
            className="mt-0.5"
          />
          <span>{t('tamperCategoryMajor')}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!config.policyCategories?.gambling}
            onChange={(e) => updatePolicy('gambling', e.target.checked)}
            className="mt-0.5"
          />
          <span>{t('tamperCategoryGambling')}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!config.policyCategories?.adult}
            onChange={(e) => updatePolicy('adult', e.target.checked)}
            className="mt-0.5"
          />
          <span>{t('tamperCategoryAdult')}</span>
        </label>
        {scanOn && (
          <label className="flex items-start gap-2 text-sm text-amber-200/90">
            <input
              type="checkbox"
              checked={!!config.contentScanConsent}
              onChange={(e) => onChange({ ...config, contentScanConsent: e.target.checked })}
              className="mt-0.5"
            />
            <span>{t('tamperContentConsent')}</span>
          </label>
        )}
        <p className="text-xs text-zinc-500">{t('tamperFalsePositiveHint')}</p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('tamperCustomBlocklist')}</label>
        <textarea
          className="input min-h-[72px] font-mono text-xs"
          placeholder={t('tamperCustomBlocklistPlaceholder')}
          value={config.customBlocklist || ''}
          onChange={(e) => onChange({ ...config, customBlocklist: e.target.value })}
        />
      </div>
    </div>
  );
}
