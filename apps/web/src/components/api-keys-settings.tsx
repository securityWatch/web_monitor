'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string;
  createdAt: string;
}

export function APIKeysSettings() {
  const orgId = getStoredAuth()?.organization.id;
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');
  const [newKey, setNewKey] = useState('');

  const load = useCallback(() => {
    if (!orgId) return;
    apiFetch<{ keys: APIKey[] }>(`/api/v1/orgs/${orgId}/api-keys`)
      .then((d) => setKeys(d.keys))
      .catch(console.error);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!orgId || !name.trim()) return;
    const res = await apiFetch<{ key: string }>(`/api/v1/orgs/${orgId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), scope }),
    });
    setNewKey(res.key);
    setName('');
    load();
  };

  const remove = async (id: string) => {
    if (!orgId || !confirm('确定撤销此 API Key？')) return;
    await apiFetch(`/api/v1/orgs/${orgId}/api-keys/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">API Keys</h2>
      <p className="text-sm text-zinc-500">用于 REST API 集成。Key 仅创建时显示一次。</p>
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" placeholder="Key 名称" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input w-28" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="read">read</option>
          <option value="write">write</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={create} className="btn-primary">创建</button>
      </div>
      {newKey && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-400">请立即保存，此 Key 不会再次显示：</p>
          <code className="mt-1 block break-all text-sm">{newKey}</code>
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2">
            <div>
              <p className="font-medium">{k.name}</p>
              <p className="font-mono text-xs text-zinc-500">{k.keyPrefix}… · {k.scope}</p>
            </div>
            <button onClick={() => remove(k.id)} className="text-red-400 hover:underline">撤销</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
