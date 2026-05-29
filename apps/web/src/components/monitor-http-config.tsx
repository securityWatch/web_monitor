'use client';

import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  HttpMonitorConfig,
  HttpStep,
  HttpExtractRule,
  emptyExtractRule,
  emptyHttpStep,
  formatExpectedStatusesInput,
  parseExpectedStatusesInput,
} from '@/lib/monitor-config';

interface Props {
  type: string;
  config: HttpMonitorConfig;
  onChange: (config: HttpMonitorConfig) => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function MonitorHttpConfig({ type, config, onChange }: Props) {
  const t = useTranslations('monitors');

  if (type !== 'http' && type !== 'keyword' && type !== 'ssl') return null;

  const method = (config.method || 'GET').toUpperCase();
  const useChain = (config.steps?.length || 0) > 0;

  const update = (patch: Partial<HttpMonitorConfig>) => onChange({ ...config, ...patch });

  const updateStep = (index: number, patch: Partial<HttpStep>) => {
    const steps = [...(config.steps || [])];
    steps[index] = { ...steps[index], ...patch };
    update({ steps });
  };

  const updateExtract = (stepIndex: number, extractIndex: number, patch: Partial<HttpExtractRule>) => {
    const steps = [...(config.steps || [])];
    const extracts = [...(steps[stepIndex].extract || [])];
    extracts[extractIndex] = { ...extracts[extractIndex], ...patch };
    steps[stepIndex] = { ...steps[stepIndex], extract: extracts };
    update({ steps });
  };

  const headersText = JSON.stringify(config.headers || {}, null, 2);

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="font-semibold">{t('httpRequestTitle')}</h3>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={useChain}
          onChange={(e) => update({ steps: e.target.checked ? [emptyHttpStep()] : [] })}
        />
        <span>{t('enableRequestChain')}</span>
        <span className="group relative inline-flex">
          <button
            type="button"
            tabIndex={0}
            className="inline-flex text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:text-zinc-300"
            aria-label={t('enableRequestChainHelpTitle')}
          >
            <CircleHelp className="h-4 w-4" />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-72 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-800 p-2.5 text-xs leading-relaxed text-zinc-300 shadow-lg group-hover:block group-focus-within:block"
          >
            {t('enableRequestChainHelp')}
          </span>
        </span>
      </label>

      {!useChain ? (
        <>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('httpMethod')}</label>
            <select className="input" value={method} onChange={(e) => update({ method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          {BODY_METHODS.has(method) && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">{t('requestBody')}</label>
              <textarea
                className="input min-h-28 font-mono text-xs"
                placeholder={'{"key":"value"}'}
                value={config.body || ''}
                onChange={(e) => update({ body: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('requestHeaders')}</label>
            <textarea
              className="input min-h-20 font-mono text-xs"
              placeholder={'{\n  "Authorization": "Bearer token"\n}'}
              value={headersText === '{}' ? '' : headersText}
              onChange={(e) => {
                try {
                  const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : {};
                  update({ headers: parsed });
                } catch {
                  /* keep typing */
                }
              }}
            />
          </div>
          {type === 'keyword' && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">{t('keywordLabel')}</label>
              <input className="input" value={config.keyword || ''} onChange={(e) => update({ keyword: e.target.value })} />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">{t('requestChainHint')}</p>
          {(config.steps || []).map((step, stepIndex) => (
            <div key={stepIndex} className="space-y-3 rounded-lg border border-zinc-700 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('chainStep', { n: stepIndex + 1 })}</span>
                {(config.steps?.length || 0) > 1 && (
                  <button
                    type="button"
                    className="text-xs text-red-400"
                    onClick={() => update({ steps: config.steps?.filter((_, i) => i !== stepIndex) })}
                  >
                    {t('removeStep')}
                  </button>
                )}
              </div>
              <input
                className="input text-sm"
                placeholder={t('stepName')}
                value={step.name || ''}
                onChange={(e) => updateStep(stepIndex, { name: e.target.value })}
              />
              <input
                className="input font-mono text-sm"
                placeholder={stepIndex === 0 ? t('stepUrlOptional') : t('stepUrlRequired')}
                value={step.url || ''}
                onChange={(e) => updateStep(stepIndex, { url: e.target.value })}
              />
              <select className="input" value={(step.method || 'GET').toUpperCase()} onChange={(e) => updateStep(stepIndex, { method: e.target.value })}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {BODY_METHODS.has((step.method || 'GET').toUpperCase()) && (
                <textarea
                  className="input min-h-24 font-mono text-xs"
                  placeholder={t('requestBodyWithVars')}
                  value={step.body || ''}
                  onChange={(e) => updateStep(stepIndex, { body: e.target.value })}
                />
              )}
              <textarea
                className="input min-h-16 font-mono text-xs"
                placeholder={t('stepHeadersPlaceholder')}
                value={step.headers && Object.keys(step.headers).length ? JSON.stringify(step.headers, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : {};
                    updateStep(stepIndex, { headers: parsed });
                  } catch { /* typing */ }
                }}
              />
              <div>
                <label className="mb-1 block text-xs text-zinc-400">{t('expectedStatus')}</label>
                <input
                  className="input font-mono text-sm"
                  placeholder={t('expectedStatusPlaceholder')}
                  value={formatExpectedStatusesInput(step.expectedStatuses, step.expectedStatus)}
                  onChange={(e) => updateStep(stepIndex, { expectedStatuses: parseExpectedStatusesInput(e.target.value), expectedStatus: undefined })}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">{t('extractRules')}</p>
                {(step.extract || []).map((rule, extractIndex) => (
                  <div key={extractIndex} className="grid gap-2 sm:grid-cols-4">
                    <input className="input text-xs" placeholder={t('varName')} value={rule.var} onChange={(e) => updateExtract(stepIndex, extractIndex, { var: e.target.value })} />
                    <select className="input text-xs" value={rule.from} onChange={(e) => updateExtract(stepIndex, extractIndex, { from: e.target.value as HttpExtractRule['from'] })}>
                      <option value="json">JSON</option>
                      <option value="regex">Regex</option>
                      <option value="header">Header</option>
                    </select>
                    <input
                      className="input text-xs sm:col-span-2"
                      placeholder={rule.from === 'regex' ? t('regexPattern') : t('jsonPathOrHeader')}
                      value={rule.from === 'regex' ? (rule.pattern || '') : (rule.path || '')}
                      onChange={(e) => updateExtract(stepIndex, extractIndex, rule.from === 'regex' ? { pattern: e.target.value } : { path: e.target.value })}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-blue-400"
                  onClick={() => updateStep(stepIndex, { extract: [...(step.extract || []), emptyExtractRule()] })}
                >
                  + {t('addExtract')}
                </button>
              </div>
            </div>
          ))}
          {(config.steps?.length || 0) < 5 && (
            <button type="button" className="btn-secondary text-sm" onClick={() => update({ steps: [...(config.steps || []), emptyHttpStep()] })}>
              + {t('addStep')}
            </button>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-zinc-400">{t('expectedStatus')}</label>
        <input
          className="input max-w-xs font-mono"
          placeholder={t('expectedStatusPlaceholder')}
          value={formatExpectedStatusesInput(config.expectedStatuses, config.expectedStatus)}
          onChange={(e) => update({ expectedStatuses: parseExpectedStatusesInput(e.target.value), expectedStatus: undefined })}
        />
        <p className="mt-1 text-xs text-zinc-500">{t('expectedStatusHint')}</p>
      </div>
    </div>
  );
}
