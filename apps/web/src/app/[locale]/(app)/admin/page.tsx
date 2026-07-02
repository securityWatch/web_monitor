'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { Shield, Mail, Users, Activity, Search } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  orgCount: number;
  monitorCount: number;
  monitorNames: string[];
  createdAt: string;
}

export default function AdminPage() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    apiFetch<{ users: AdminUser[] }>(`/api/v1/admin/users?${params}`)
      .then((d) => setUsers(d.users))
      .catch((err) => {
        console.error('Admin API error:', err);
        setError(err.message || 'Unknown error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
      </div>

      <div className="flex gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-9"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="card border border-red-800/50 bg-red-900/20 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-400">{t('loadError')}</p>
              <p className="text-xs text-red-300/70">{error}</p>
              {error.includes('FORBIDDEN') && (
                <p className="text-xs text-red-300/70">{t('notAdminHint')}</p>
              )}
            </div>
            <button
              onClick={load}
              className="rounded-md bg-red-800/50 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-700/50 hover:text-red-200"
            >
              {t('retry')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <p className="text-zinc-500">{tc('loading')}</p>
        </div>
      ) : error ? null : users.length === 0 ? (
        <div className="card flex items-center justify-center py-16">
          <p className="text-zinc-500">{t('noUsers')}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-900/95">
              <tr className="text-left text-zinc-500">
                <th className="p-4">{t('email')}</th>
                <th className="p-4">{t('displayName')}</th>
                <th className="p-4">{tc('status')}</th>
                <th className="p-4">{t('orgs')}</th>
                <th className="p-4">{t('monitors')}</th>
                <th className="p-4">{t('joined')}</th>
                <th className="p-4">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-zinc-500" />
                      <span>{u.email}</span>
                      {u.isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                          <Shield className="h-3 w-3" /> {t('adminBadge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-zinc-300">
                    {u.displayName || '—'}
                  </td>
                  <td className="p-4">
                    {u.emailVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-0.5 text-[10px] font-medium text-green-400">
                        {t('emailVerified')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/50 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                        {t('emailUnverified')}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-zinc-500" />
                      <span>{u.orgCount}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="group relative flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-zinc-500" />
                      <span className={u.monitorCount > 0 ? 'cursor-pointer underline decoration-dotted underline-offset-2 decoration-zinc-600' : ''}>
                        {u.monitorCount}
                      </span>
                      {u.monitorCount > 0 && u.monitorNames.length > 0 && (
                        <div className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 shadow-xl opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
                          <div className="flex flex-col gap-1">
                            {u.monitorNames.map((name, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                <span className="h-1 w-1 rounded-full bg-blue-500" />
                                {name}
                              </span>
                            ))}
                          </div>
                          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700/50" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-zinc-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
                    >
                      {t('userDetail')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
