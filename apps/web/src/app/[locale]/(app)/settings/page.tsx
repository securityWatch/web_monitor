'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { apiFetch, getStoredAuth, setStoredAuth } from '@/lib/api';
import { LanguageToggle } from '@/components/language-toggle';
import { AlertIntegrations } from '@/components/alert-integrations';
import { TeamSettings } from '@/components/team-settings';
import { MaintenanceWindows } from '@/components/maintenance-windows';
import { APIKeysSettings } from '@/components/api-keys-settings';
import { TotpSettings } from '@/components/totp-settings';
import { OnCallSettings } from '@/components/oncall-settings';
import { AuditLogs } from '@/components/audit-logs';
import { EmailVerificationBanner } from '@/components/email-verification-banner';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const locale = useLocale();
  const auth = getStoredAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications' | 'integrations' | 'team' | 'maintenance' | 'apikeys' | 'billing' | 'audit' | 'oncall'>('profile');
  const [displayName, setDisplayName] = useState(auth?.user.displayName || '');
  const [passwords, setPasswords] = useState({ current: '', newPass: '' });
  const [notify, setNotify] = useState({
    incidents: auth?.user.notifyIncidents ?? true,
    daily: auth?.user.notifyDaily ?? false,
    weekly: auth?.user.notifyWeekly ?? true,
    product: auth?.user.notifyProduct ?? false,
    ssl: auth?.user.notifySsl ?? true,
  });
  const [msg, setMsg] = useState('');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [systemReport, setSystemReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const saveProfile = async () => {
    await apiFetch('/api/v1/me/profile', { method: 'PATCH', body: JSON.stringify({ displayName, locale }) });
    if (auth) setStoredAuth({ ...auth, user: { ...auth.user, displayName } });
    setMsg(t('saved'));
  };

  const changePassword = async () => {
    await apiFetch('/api/v1/me/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.newPass }),
    });
    setMsg(t('saved'));
    setPasswords({ current: '', newPass: '' });
  };

  const saveNotify = async () => {
    await apiFetch('/api/v1/me/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ notifyIncidents: notify.incidents, notifyDaily: notify.daily, notifyWeekly: notify.weekly, notifyProduct: notify.product, notifySsl: notify.ssl }),
    });
    setMsg(t('saved'));
  };

  const generateSystemReport = async (withAI: boolean) => {
    if (!auth?.organization.id) return;
    setReportLoading(true);
    setMsg('');
    try {
      const res = await apiFetch<{
        report: {
          period: string; days: number; monitorCount: number; upMonitors: number; downMonitors: number; pausedMonitors: number;
          uptimePct: number; totalChecks: number; failedChecks: number; avgResponseMs: number; incidentCount: number; openIncidents: number; securityFindings: number;
          aiSummary?: { headline?: string; summary?: string; risks?: string[]; wins?: string[]; nextActions?: string[]; customerBrief?: string };
        };
      }>(`/api/v1/orgs/${auth.organization.id}/reports/system?period=${reportPeriod}&ai=${withAI ? 'true' : 'false'}`);
      const r = res.report;
      const ai = r.aiSummary;
      setSystemReport([
        `${r.period} 报告（${r.days} 天）`,
        `监控：${r.monitorCount} 个（正常 ${r.upMonitors} / 故障 ${r.downMonitors} / 暂停 ${r.pausedMonitors}）`,
        `可用率：${r.uptimePct}% · 检查 ${r.totalChecks} 次 · 失败 ${r.failedChecks} 次 · 平均响应 ${r.avgResponseMs}ms`,
        `事件：${r.incidentCount} 个（进行中 ${r.openIncidents}） · 安全发现 ${r.securityFindings} 条`,
        ai?.headline ? `AI：${ai.headline}` : '',
        ai?.summary || '',
        ai?.risks?.length ? `风险：${ai.risks.join('；')}` : '',
        ai?.nextActions?.length ? `建议：${ai.nextActions.join('；')}` : '',
      ].filter(Boolean).join('\n'));
    } catch (err) {
      setSystemReport(err instanceof Error ? err.message : 'Report error');
    } finally {
      setReportLoading(false);
    }
  };

  const tabs = [
    { id: 'profile' as const, label: t('profile') },
    { id: 'security' as const, label: t('security') },
    { id: 'notifications' as const, label: t('notifications') },
    { id: 'integrations' as const, label: t('integrationsTab') },
    { id: 'team' as const, label: '团队' },
    { id: 'maintenance' as const, label: '维护窗口' },
    { id: 'apikeys' as const, label: locale === 'zh' ? '接口密钥' : 'API Keys' },
    { id: 'audit' as const, label: '审计日志' },
    { id: 'oncall' as const, label: 'On-Call' },
    { id: 'billing' as const, label: t('billing') },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <div className="w-full overflow-x-auto border-b border-zinc-800 pb-4 [scrollbar-width:thin]">
        <div className="inline-flex min-w-max gap-2 whitespace-nowrap">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => { setTab(tb.id); setMsg(''); }} className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm ${tab === tb.id ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}>{tb.label}</button>
        ))}
        </div>
      </div>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      <EmailVerificationBanner />

      {tab === 'profile' && (
        <div className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('displayName')}</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('languagePref')}</label>
            <p className="mb-2 text-xs text-zinc-500">{t('languageDesc')}</p>
            <LanguageToggle />
          </div>
          <button onClick={saveProfile} className="btn-primary">{tc('save')}</button>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold">{t('changePassword')}</h2>
            <input type="password" className="input" placeholder={t('currentPassword')} value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
            <input type="password" className="input" placeholder={t('newPassword')} value={passwords.newPass} onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })} />
            <button onClick={changePassword} className="btn-primary">{t('changePassword')}</button>
          </div>
          <TotpSettings />
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card space-y-4">
          {[
            { key: 'incidents' as const, label: t('notifyIncidents') },
            { key: 'daily' as const, label: t('notifyDaily') },
            { key: 'weekly' as const, label: t('notifyWeekly') },
            { key: 'product' as const, label: t('notifyProduct') },
            { key: 'ssl' as const, label: t('notifySsl') },
          ].map((n) => (
            <label key={n.key} className="flex items-center gap-3">
              <input type="checkbox" checked={notify[n.key]} onChange={(e) => setNotify({ ...notify, [n.key]: e.target.checked })} className="rounded" />
              {n.label}
            </label>
          ))}
          <button onClick={saveNotify} className="btn-primary">{tc('save')}</button>
        </div>
      )}

      {tab === 'integrations' && <AlertIntegrations />}

      {tab === 'team' && <TeamSettings />}

      {tab === 'maintenance' && <MaintenanceWindows />}

      {tab === 'apikeys' && <APIKeysSettings />}

      {tab === 'audit' && <AuditLogs />}

      {tab === 'oncall' && <OnCallSettings />}

      {tab === 'billing' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">{t('billingTitle')}</h2>
          {auth?.organization.planTier === 'pro' && (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
              {t('foundingMember')}
            </span>
          )}
          <p className="text-sm text-zinc-400">{t('billingDesc')}</p>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <p className="text-sm text-zinc-500">{t('currentPlan')}</p>
            <p className="text-xl font-bold capitalize">{auth?.organization.planTier || 'free'}</p>
          </div>
          <button
            className="btn-primary"
            onClick={async () => {
              if (!auth?.organization.id) return;
              try {
                const res = await apiFetch<{ url: string }>(`/api/v1/orgs/${auth.organization.id}/billing/checkout`, { method: 'POST' });
                window.location.href = res.url;
              } catch {
                setMsg('Stripe 未配置，请联系管理员');
              }
            }}
          >
            {t('upgradePro')}
          </button>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            <p className="text-sm font-medium text-zinc-300">监控报告</p>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
              <select className="input" value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                <option value="daily">{t('dailyReport')}</option>
                <option value="weekly">{t('weeklyReport')}</option>
                <option value="monthly">{t('monthlyReport')}</option>
              </select>
              <button type="button" className="btn-secondary" onClick={() => generateSystemReport(false)} disabled={reportLoading}>
                {reportLoading ? '...' : t('systemReport')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => generateSystemReport(true)} disabled={reportLoading}>
                {t('systemReportAI')}
              </button>
            </div>
          </div>
          {systemReport && <pre className="whitespace-pre-wrap rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100/80">{systemReport}</pre>}
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              if (!auth?.organization.id) return;
              const token = getStoredAuth()?.accessToken;
              const res = await fetch(`/api/v1/orgs/${auth.organization.id}/reports/sla.csv`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              const blob = await res.blob();
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'sla-report.csv';
              a.click();
            }}
          >
            导出 SLA 报告 (CSV)
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              if (!auth?.organization.id) return;
              const token = getStoredAuth()?.accessToken;
              const res = await fetch(`/api/v1/orgs/${auth.organization.id}/reports/sla.html`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              const html = await res.text();
              const blob = new Blob([html], { type: 'text/html' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'sla-report.html';
              a.click();
            }}
          >
            导出 SLA 报告 (HTML)
          </button>
        </div>
      )}
    </div>
  );
}
