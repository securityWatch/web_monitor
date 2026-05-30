'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface Member {
  id: string;
  email: string;
  displayName?: string;
}

export function OnCallSettings() {
  const orgId = getStoredAuth()?.organization.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [form, setForm] = useState({ name: 'Primary', userIds: [] as string[] });
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    if (!orgId) return;
    apiFetch<{ members: Member[] }>(`/api/v1/orgs/${orgId}/members`).then((d) => setMembers(d.members || [])).catch(() => {});
    apiFetch<{ schedules: { id: string; name: string; enabled: boolean }[] }>(`/api/v1/orgs/${orgId}/on-call/schedules`)
      .then((d) => setSchedules(d.schedules))
      .catch(() => {});
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!orgId || !form.name || form.userIds.length === 0) return;
    await apiFetch(`/api/v1/orgs/${orgId}/on-call/schedules`, {
      method: 'POST',
      body: JSON.stringify({ name: form.name, userIds: form.userIds, escalationMinutes: 15 }),
    });
    setMsg('排班表已创建');
    setForm({ name: 'Primary', userIds: [] });
    load();
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">On-Call 排班</h2>
      <p className="text-sm text-zinc-400">设置轮值顺序，故障时优先通知当前值班人（配合 SMS 渠道）。</p>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {schedules.length > 0 && (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
              {s.name} {s.enabled ? '· 已启用' : ''}
            </div>
          ))}
        </div>
      )}

      <input className="input" placeholder="排班表名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.userIds.includes(m.id)}
              onChange={(e) => setForm({
                ...form,
                userIds: e.target.checked ? [...form.userIds, m.id] : form.userIds.filter((id) => id !== m.id),
              })}
            />
            {m.displayName || m.email}
          </label>
        ))}
      </div>
      <button type="button" onClick={create} className="btn-primary">创建排班表</button>
    </div>
  );
}
