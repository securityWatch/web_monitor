'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface Window {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  message?: string;
}

export function MaintenanceWindows() {
  const orgId = getStoredAuth()?.organization.id;
  const [windows, setWindows] = useState<Window[]>([]);
  const [form, setForm] = useState({ name: '维护窗口', startsAt: '', endsAt: '', message: '' });

  const load = useCallback(() => {
    if (!orgId) return;
    apiFetch<{ windows: Window[] }>(`/api/v1/orgs/${orgId}/maintenance-windows`)
      .then((d) => setWindows(d.windows))
      .catch(console.error);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!orgId || !form.startsAt || !form.endsAt) return;
    await apiFetch(`/api/v1/orgs/${orgId}/maintenance-windows`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        message: form.message,
      }),
    });
    setForm({ name: '维护窗口', startsAt: '', endsAt: '', message: '' });
    load();
  };

  const remove = async (id: string) => {
    if (!orgId) return;
    await apiFetch(`/api/v1/orgs/${orgId}/maintenance-windows/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">维护窗口</h2>
      <p className="text-sm text-zinc-500">维护期间暂停检测与告警。</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        <input type="datetime-local" className="input" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
      </div>
      <input className="input" placeholder="说明（可选）" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button onClick={create} className="btn-primary">添加维护窗口</button>
      <ul className="space-y-2 text-sm">
        {windows.map((w) => (
          <li key={w.id} className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2">
            <div>
              <p className="font-medium">{w.name}</p>
              <p className="text-xs text-zinc-500">{new Date(w.startsAt).toLocaleString()} — {new Date(w.endsAt).toLocaleString()}</p>
            </div>
            <button onClick={() => remove(w.id)} className="text-red-400 hover:underline">删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
