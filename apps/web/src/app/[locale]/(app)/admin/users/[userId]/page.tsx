'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  Shield, Mail, Users, Activity, Clock, Zap,
  ArrowLeft, Building2, CreditCard, ChevronDown, ChevronRight
} from 'lucide-react';

interface AdminUserDetail {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  organizations: AdminUserOrg[];
}

interface AdminUserOrg {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  role: string;
  monitorCount: number;
}

interface AdminMonitor {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  type: string;
  targetUrl: string;
  status: string;
  intervalSeconds: number;
  lastResponseMs: number | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  up: 'bg-green-900/50 text-green-400',
  down: 'bg-red-900/50 text-red-400',
  paused: 'bg-yellow-900/50 text-yellow-400',
  pending: 'bg-zinc-700/50 text-zinc-400',
};

export default function AdminUserDetailPage() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const params = useParams();
  const userId = params.userId as string;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [monitors, setMonitors] = useState<AdminMonitor[]>([]);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [loadingMonitors, setLoadingMonitors] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    apiFetch<AdminUserDetail>(`/api/v1/admin/users/${userId}`)
      .then(setUser)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleOrg = async (orgId: string) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      setMonitors([]);
      return;
    }
    setExpandedOrg(orgId);
    setLoadingMonitors(true);
    try {
      const data = await apiFetch<{ monitors: AdminMonitor[] }>(
        `/api/v1/admin/users/${userId}/monitors?orgId=${orgId}`
      );
      setMonitors(data.monitors);
    } catch (e) {
      console.error(e);
      setMonitors([]);
    } finally {
      setLoadingMonitors(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6">
        <div className="card flex items-center justify-center py-16">
          <p className="text-zinc-500">{tc('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6">
        <div className="card flex items-center justify-center py-16">
          <p className="text-zinc-500">{tc('noData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> {t('backToList')}
      </Link>

      {/* 用户基本信息卡片 */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{user.displayName || user.email}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
              <Mail className="h-4 w-4" /> {user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user.isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 px-3 py-1 text-xs font-medium text-blue-400">
                <Shield className="h-3.5 w-3.5" /> {t('adminBadge')}
              </span>
            )}
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-900/50 px-3 py-1 text-xs font-medium text-green-400">
                {t('emailVerified')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/50 px-3 py-1 text-xs font-medium text-yellow-400">
                {t('emailUnverified')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{user.organizations.length} {t('orgs')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>{t('joined')}: {new Date(user.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 组织的监控列表 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('orgs')}</h2>
        {user.organizations.length === 0 ? (
          <div className="card flex items-center justify-center py-8">
            <p className="text-sm text-zinc-500">{t('noOrgs')}</p>
          </div>
        ) : (
          user.organizations.map((org) => (
            <div key={org.id} className="card overflow-hidden p-0">
              <button
                onClick={() => toggleOrg(org.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-zinc-400" />
                  <div>
                    <span className="font-medium">{org.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">({org.slug})</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3.5 w-3.5" /> {org.planTier}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" /> {org.monitorCount}
                    </span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">{org.role}</span>
                  </div>
                  {expandedOrg === org.id ? (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
              </button>

              {expandedOrg === org.id && (
                <div className="border-t border-zinc-800">
                  {loadingMonitors ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-sm text-zinc-500">{tc('loading')}</p>
                    </div>
                  ) : monitors.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-sm text-zinc-500">{t('noMonitors')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-900/50">
                          <tr className="text-left text-xs text-zinc-500">
                            <th className="p-3 pl-4">{t('monitorName')}</th>
                            <th className="p-3">{t('monitorType')}</th>
                            <th className="p-3">{t('monitorTarget')}</th>
                            <th className="p-3">{t('monitorStatus')}</th>
                            <th className="p-3">{t('monitorInterval')}</th>
                            <th className="p-3">{t('monitorResponse')}</th>
                            <th className="p-3">{t('monitorCreated')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monitors.map((m) => (
                            <tr key={m.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/20">
                              <td className="p-3 pl-4 font-medium text-zinc-200">{m.name}</td>
                              <td className="p-3">
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                                  {m.type}
                                </span>
                              </td>
                              <td className="max-w-[200px] truncate p-3 font-mono text-xs text-zinc-400">
                                {m.targetUrl}
                              </td>
                              <td className="p-3">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[m.status] || STATUS_COLORS.pending}`}>
                                  {m.status}
                                </span>
                              </td>
                              <td className="p-3 text-zinc-400 text-xs">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {m.intervalSeconds >= 60
                                    ? `${Math.floor(m.intervalSeconds / 60)}m`
                                    : `${m.intervalSeconds}s`}
                                </span>
                              </td>
                              <td className="p-3 text-zinc-400 text-xs">
                                {m.lastResponseMs != null ? (
                                  <span className="flex items-center gap-1">
                                    <Zap className="h-3 w-3" />
                                    {m.lastResponseMs}ms
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="p-3 text-xs text-zinc-500">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
