'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredAuth } from '@/lib/api';

export function TeamSettings() {
  const orgId = getStoredAuth()?.organization.id;
  const [members, setMembers] = useState<{ id: string; email: string; displayName?: string; role: string }[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    if (!orgId) return;
    apiFetch<{ members: typeof members }>(`/api/v1/orgs/${orgId}/members`)
      .then((d) => setMembers(d.members))
      .catch(console.error);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!orgId || !email.trim()) return;
    const res = await apiFetch<{ token: string }>(`/api/v1/orgs/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setMsg(`邀请已创建，接受链接 token: ${res.token}`);
    setEmail('');
    load();
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">团队成员</h2>
      <ul className="space-y-2 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex justify-between rounded border border-zinc-800 px-3 py-2">
            <span>{m.displayName || m.email}</span>
            <span className="text-zinc-500">{m.role}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input w-28" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="viewer">viewer</option>
        </select>
        <button onClick={invite} className="btn-primary">邀请</button>
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
    </div>
  );
}
