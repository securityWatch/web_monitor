'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { OnboardingWizard } from '@/components/onboarding-wizard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!getStoredAuth()) {
      router.push('/login');
      return;
    }
    apiFetch<{ user: { onboardingDone?: boolean } }>('/api/v1/me')
      .then((d) => setShowOnboarding(!d.user.onboardingDone))
      .catch(() => {});
  }, [router]);

  return (
    <DashboardShell>
      {showOnboarding && <OnboardingWizard />}
      {children}
    </DashboardShell>
  );
}
