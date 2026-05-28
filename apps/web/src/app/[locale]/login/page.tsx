'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch, setStoredAuth } from '@/lib/api';
import type { AuthData } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AuthData>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredAuth(data);
      router.push('/dashboard');
    } catch {
      setError(t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="text-2xl font-bold text-white">{t('loginTitle')}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t('loginSubtitle')}</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('email')}</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('password')}</label>
            <input type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? '...' : t('loginButton')}</button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/forgot-password" className="text-blue-400 hover:underline">{t('forgotLink')}</Link>
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">
          {t('noAccount')} <Link href="/register" className="text-blue-400 hover:underline">{t('signupLink')}</Link>
        </p>
      </div>
    </div>
  );
}
