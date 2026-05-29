'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch } from '@/lib/api';

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('重置失败，链接可能已过期');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold text-white">重置密码</h1>
        {done ? (
          <p className="mt-4 text-emerald-400">密码已更新，正在跳转登录…</p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <input type="password" required minLength={8} className="input" placeholder={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-primary w-full py-2.5">更新密码</button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/login" className="text-blue-400 hover:underline">{t('loginButton')}</Link>
        </p>
      </div>
    </div>
  );
}
