'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { setStoredAuth } from '@/lib/api';
import type { AuthData } from '@/lib/api';

export default function AuthCallbackPage() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    if (!accessToken || !refreshToken) {
      setError('oauth_failed');
      return;
    }
    localStorage.setItem('pulsewatch_auth', JSON.stringify({ accessToken, refreshToken }));
    fetch('/api/v1/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => {
        const auth: AuthData = {
          accessToken,
          refreshToken,
          user: {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName,
            locale: data.user.locale,
          },
          organization: data.organizations?.[0]
            ? {
                id: data.organizations[0].id,
                name: data.organizations[0].name,
                slug: data.organizations[0].slug,
                planTier: data.organizations[0].planTier,
                monitorQuota: data.organizations[0].monitorQuota,
              }
            : { id: '', name: '', slug: '', planTier: 'free', monitorQuota: 10 },
        };
        setStoredAuth(auth);
        router.push(data.user.onboardingDone ? '/dashboard' : '/onboarding');
      })
      .catch(() => setError('oauth_failed'));
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-zinc-400">
      {error ? t('callbackFailed') : t('callbackCompleting')}
    </div>
  );
}
