'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch, setStoredAuth } from '@/lib/api';
import type { AuthData } from '@/lib/api';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', confirm: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AuthData>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, password: form.password, displayName: form.displayName }),
      });
      setStoredAuth(data);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="text-2xl font-bold text-white">{t('registerTitle')}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t('registerSubtitle')}</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('displayName')}</label>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('email')}</label>
            <input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('password')}</label>
            <input type="password" required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">{t('confirmPassword')}</label>
            <input type="password" required className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? '...' : t('registerButton')}</button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          {t('hasAccount')} <Link href="/login" className="text-blue-400 hover:underline">{t('loginLink')}</Link>
        </p>
      </div>
    </div>
  );
}
