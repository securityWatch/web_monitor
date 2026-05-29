'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getStoredAuth } from '@/lib/api';

interface AuditEntry {
  id: string;
  action: string;
  ip?: string;
  createdAt: string;
  userEmail?: string;
}

export function AuditLogs() {
  const orgId = getStoredAuth()?.organization.id;
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    apiFetch<{ logs: AuditEntry[] }>(`/api/v1/orgs/${orgId}/audit-logs`)
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'));
  }, [orgId]);

  if (error) {
    return <div className="card text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">审计日志</h2>
      <p className="text-sm text-zinc-500">最近 100 条组织操作记录（仅管理员可见）</p>
      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无记录</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-4">时间</th>
                <th className="pb-2 pr-4">操作</th>
                <th className="pb-2 pr-4">用户</th>
                <th className="pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 text-xs text-zinc-400">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{l.action}</td>
                  <td className="py-2 pr-4 text-xs">{l.userEmail || '—'}</td>
                  <td className="py-2 text-xs text-zinc-500">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
