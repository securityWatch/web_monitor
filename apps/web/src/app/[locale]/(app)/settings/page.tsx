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
  const [notify, setNotify] = useState({ incidents: true, weekly: true, product: false, ssl: true });
  const [msg, setMsg] = useState('');

  const startCheckout = async (plan: 'pro' | 'team' | 'business') => {
    if (!auth?.organization.id) return;
    try {
      const res = await apiFetch<{ url: string }>(`/api/v1/orgs/${auth.organization.id}/billing/checkout`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      window.location.href = res.url;
    } catch {
      setMsg(t('stripeNotConfigured'));
    }
  };

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
      body: JSON.stringify({ notifyIncidents: notify.incidents, notifyWeekly: notify.weekly, notifyProduct: notify.product, notifySsl: notify.ssl }),
    });
    setMsg(t('saved'));
  };

  const tabs = [
    { id: 'profile' as const, label: t('profile') },
    { id: 'security' as const, label: t('security') },
    { id: 'notifications' as const, label: t('notifications') },
    { id: 'integrations' as const, label: t('integrationsTab') },
    { id: 'team' as const, label: t('team') },
    { id: 'maintenance' as const, label: t('maintenance') },
    { id: 'apikeys' as const, label: t('apiKeys') },
    { id: 'audit' as const, label: t('auditLogs') },
    { id: 'oncall' as const, label: t('onCall') },
    { id: 'billing' as const, label: t('billing') },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-4">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => { setTab(tb.id); setMsg(''); }} className={`rounded-lg px-4 py-2 text-sm ${tab === tb.id ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}>{tb.label}</button>
        ))}
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
          <div className="grid gap-3 sm:grid-cols-3">
            {(['pro', 'team', 'business'] as const).map((plan) => (
              <button key={plan} className="btn-primary" onClick={() => startCheckout(plan)}>
                {t(`upgrade${plan[0].toUpperCase()}${plan.slice(1)}` as 'upgradePro')}
              </button>
            ))}
          </div>
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
            {t('exportSlaCsv')}
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
            {t('exportSlaHtml')}
          </button>
        </div>
      )}
    </div>
  );
}
