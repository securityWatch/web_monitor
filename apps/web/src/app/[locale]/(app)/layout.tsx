'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getStoredAuth } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getStoredAuth()) {
      router.push('/login');
    }
  }, [router]);

  return <DashboardShell>{children}</DashboardShell>;
}
