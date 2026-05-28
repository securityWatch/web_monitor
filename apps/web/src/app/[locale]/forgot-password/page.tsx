'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {});
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold">{t('forgotTitle')}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t('forgotSubtitle')}</p>
        {sent ? (
          <p className="mt-8 text-emerald-400">{t('forgotSuccess')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <input type="email" required className="input" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="btn-primary w-full">{t('forgotButton')}</button>
          </form>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm text-blue-400">{t('loginLink')}</Link>
      </div>
    </div>
  );
}
