'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getStoredAuth, setStoredAuth, type AuthData, type Organization } from '@/lib/api';
import { Building2, ChevronDown } from 'lucide-react';

export function OrgSwitcher() {
  const auth = getStoredAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    apiFetch<{ organizations: Organization[] }>('/api/v1/me')
      .then((d) => setOrgs(d.organizations || []))
      .catch(() => {});
  }, []);

  if (orgs.length <= 1) {
    return (
      <span className="hidden text-sm text-zinc-500 sm:block">
        {auth?.organization.name}
      </span>
    );
  }

  const switchOrg = async (orgId: string) => {
    if (orgId === auth?.organization.id || switching) return;
    setSwitching(true);
    try {
      const data = await apiFetch<AuthData>('/api/v1/me/switch-org', {
        method: 'POST',
        body: JSON.stringify({ orgId }),
      });
      setStoredAuth(data);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
      >
        <Building2 className="h-4 w-4 text-zinc-500" />
        <span className="max-w-[140px] truncate">{auth?.organization.name}</span>
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => switchOrg(o.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                  o.id === auth?.organization.id ? 'text-blue-400' : 'text-zinc-300'
                }`}
              >
                <span className="truncate">{o.name}</span>
                <span className="text-xs capitalize text-zinc-600">{o.planTier}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
