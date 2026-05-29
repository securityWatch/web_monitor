'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { Plus, ExternalLink } from 'lucide-react';

interface StatusPage {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
}

interface Monitor {
  id: string;
  name: string;
}

export default function StatusPagesPage() {
  const t = useTranslations('statusPages');
  const tc = useTranslations('common');
  const orgId = getStoredAuth()?.organization.id;
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', monitorIds: [] as string[] });

  useEffect(() => {
    if (!orgId) return;
    apiFetch<{ statusPages: StatusPage[] }>(`/api/v1/orgs/${orgId}/status-pages`).then((d) => setPages(d.statusPages)).catch(console.error);
    apiFetch<{ monitors: Monitor[] }>(`/api/v1/orgs/${orgId}/monitors`).then((d) => setMonitors(d.monitors)).catch(console.error);
  }, [orgId]);

  const create = async () => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/status-pages`, {
      method: 'POST',
      body: JSON.stringify({ name: form.name, slug: form.slug, monitorIds: form.monitorIds, isPublic: true }),
    });
    setShowForm(false);
    setForm({ name: '', slug: '', monitorIds: [] });
    const d = await apiFetch<{ statusPages: StatusPage[] }>(`/api/v1/orgs/${orgId}/status-pages`);
    setPages(d.statusPages);
  };

  const remove = async (id: string) => {
    if (!orgId || !confirm(t('deleteConfirm'))) return;
    await apiFetch(`/api/v1/orgs/${orgId}/status-pages/${id}`, { method: 'DELETE' });
    setPages((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-zinc-500">{t('subtitle')}</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> {t('create')}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold">{t('create')}</h2>
          <input className="input" placeholder={t('pageName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input font-mono" placeholder={t('slugPlaceholder')} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
          <div>
            <p className="mb-2 text-sm text-zinc-400">{t('selectMonitors')}</p>
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {monitors.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.monitorIds.includes(m.id)}
                    onChange={(e) => setForm({
                      ...form,
                      monitorIds: e.target.checked ? [...form.monitorIds, m.id] : form.monitorIds.filter((id) => id !== m.id),
                    })}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={create}>{tc('save')}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>{tc('cancel')}</button>
          </div>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="card text-center text-zinc-500">{t('empty')}</div>
      ) : (
        <div className="space-y-3">
          {pages.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="font-mono text-sm text-zinc-500">/status/{p.slug}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/status/${p.slug}`} target="_blank" className="btn-secondary flex items-center gap-1 text-sm">
                  <ExternalLink className="h-4 w-4" /> {t('viewPublic')}
                </Link>
                <button type="button" className="text-sm text-red-400" onClick={() => remove(p.id)}>{tc('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
