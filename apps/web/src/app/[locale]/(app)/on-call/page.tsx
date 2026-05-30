'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { OnCallSettings } from '@/components/oncall-settings';
import { Bell, CheckCircle2 } from 'lucide-react';

type OnCallAlert = {
  id: string;
  incidentId: string;
  escalationLevel: number;
  createdAt: string;
  ackedAt?: string;
  title: string;
  assigneeEmail?: string;
};

export default function OnCallPage() {
  const t = useTranslations('onCall');
  const auth = getStoredAuth();
  const [alerts, setAlerts] = useState<OnCallAlert[]>([]);

  const load = () => {
    const orgId = auth?.organization.id;
    if (!orgId) return;
    apiFetch<{ alerts: OnCallAlert[] }>(`/api/v1/orgs/${orgId}/on-call/alerts`)
      .then((d) => setAlerts(d.alerts))
      .catch(() => setAlerts([]));
  };

  useEffect(() => { load(); }, [auth?.organization.id]);

  const ack = async (alertId: string) => {
    const orgId = auth!.organization.id;
    await apiFetch(`/api/v1/orgs/${orgId}/on-call/alerts/${alertId}/ack`, { method: 'POST' });
    load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
      </div>

      <section className="card space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" /> {t('pendingAlerts')}</h2>
        {alerts.filter((a) => !a.ackedAt).length === 0 ? (
          <p className="text-sm text-zinc-500">{t('noPending')}</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {alerts.filter((a) => !a.ackedAt).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/incidents/${a.incidentId}`} className="font-medium text-blue-400 hover:underline">{a.title}</Link>
                  <p className="text-xs text-zinc-500">L{a.escalationLevel} · {new Date(a.createdAt).toLocaleString()}</p>
                </div>
                <button type="button" className="btn-primary flex items-center gap-1 text-xs" onClick={() => ack(a.id)}>
                  <CheckCircle2 className="h-4 w-4" /> {t('ack')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OnCallSettings />
    </div>
  );
}
