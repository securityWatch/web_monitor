'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface TimelineEntry {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
  userEmail?: string;
}

interface IncidentDetail {
  id: string;
  title?: string;
  monitorName: string;
  status: string;
  workflowStatus?: string;
  startedAt: string;
  resolvedAt?: string;
  message?: string;
  postMortem?: string;
}

const WORKFLOW_KEYS = {
  investigating: 'workflowInvestigating',
  identified: 'workflowIdentified',
  monitoring: 'workflowMonitoring',
} as const;

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('incidents');
  const orgId = getStoredAuth()?.organization.id;
  const [incidentId, setIncidentId] = useState('');
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [note, setNote] = useState('');
  const [workflow, setWorkflow] = useState('investigating');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');

  useEffect(() => {
    params.then((p) => setIncidentId(p.id));
  }, [params]);

  useEffect(() => {
    if (!orgId || !incidentId) return;
    apiFetch<{ incident: IncidentDetail; timeline: TimelineEntry[] }>(`/api/v1/orgs/${orgId}/incidents/${incidentId}`)
      .then((d) => {
        setIncident(d.incident);
        setTimeline(d.timeline || []);
        setWorkflow(d.incident.workflowStatus || 'investigating');
      })
      .catch(console.error);
  }, [orgId, incidentId]);

  const addNote = async () => {
    if (!orgId || !note.trim()) return;
    await apiFetch(`/api/v1/orgs/${orgId}/incidents/${incidentId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ message: note }),
    });
    setNote('');
    const d = await apiFetch<{ incident: IncidentDetail; timeline: TimelineEntry[] }>(`/api/v1/orgs/${orgId}/incidents/${incidentId}`);
    setTimeline(d.timeline || []);
  };

  const updateWorkflow = async (wf: string) => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/incidents/${incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workflowStatus: wf }),
    });
    setWorkflow(wf);
  };

  const resolve = async () => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/incidents/${incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    });
    setIncident((i) => i ? { ...i, status: 'resolved', workflowStatus: 'resolved' } : i);
  };

  const generateAISummary = async () => {
    if (!orgId || !incidentId) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ postMortem: string }>(`/api/v1/orgs/${orgId}/incidents/${incidentId}/ai-summary`, { method: 'POST' });
      setAiSummary(res.postMortem);
      setIncident((i) => i ? { ...i, postMortem: res.postMortem } : i);
    } catch (err) {
      setAiSummary(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiLoading(false);
    }
  };

  if (!incident) {
    return <div className="text-zinc-500">{t('loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/incidents" className="text-sm text-blue-400 hover:underline">{t('backToList')}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{incident.title || incident.monitorName}</h1>
          <p className="text-sm text-zinc-500">{t('started')}: {new Date(incident.startedAt).toLocaleString()}</p>
        </div>
        <span className={incident.status === 'open' ? 'badge-down' : 'badge-up'}>{incident.status === 'open' ? t('open') : t('resolved')}</span>
      </div>

      <div className="card space-y-3 border-blue-500/20 bg-blue-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-blue-100">{t('aiSummaryTitle')}</h2>
            <p className="text-xs text-blue-100/60">{t('aiSummaryDesc')}</p>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={generateAISummary} disabled={aiLoading}>
            {aiLoading ? '...' : t('generateAiSummary')}
          </button>
        </div>
        {(aiSummary || incident.postMortem) && (
          <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs text-blue-100/80">{aiSummary || incident.postMortem}</pre>
        )}
      </div>

      {incident.status === 'open' && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(WORKFLOW_KEYS) as Array<keyof typeof WORKFLOW_KEYS>).map((wf) => (
            <button
              key={wf}
              type="button"
              onClick={() => updateWorkflow(wf)}
              className={`rounded-lg px-3 py-1.5 text-xs ${workflow === wf ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {t(WORKFLOW_KEYS[wf])}
            </button>
          ))}
          <button type="button" onClick={resolve} className="btn-primary text-xs">{t('markResolved')}</button>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-semibold">{t('timelineTitle')}</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('timelineEmpty')}</p>
        ) : (
          <ul className="space-y-3 border-l border-zinc-800 pl-4">
            {timeline.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-zinc-600" />
                <p className="text-xs text-zinc-500">{new Date(e.createdAt).toLocaleString()} · {e.kind}</p>
                <p className="text-zinc-300">{e.message}</p>
                {e.userEmail && <p className="text-xs text-zinc-600">{e.userEmail}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {incident.status === 'open' && (
        <div className="card flex gap-2">
          <input className="input flex-1" placeholder={t('addNotePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" onClick={addNote} className="btn-primary">{t('sendNote')}</button>
        </div>
      )}
    </div>
  );
}
