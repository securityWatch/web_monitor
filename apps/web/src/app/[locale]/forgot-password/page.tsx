'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendCode = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/forgot-password/send-code', {
        method: 'POST',
        body: JSON.stringify({ email, locale }),
      });
      setStep('reset');
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_RATE_LIMIT') {
        setError(t('otpRateLimit'));
      } else {
        setError(t('otpSendFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [email, locale, t]);

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      router.push('/login');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_OTP') {
        setError(t('otpInvalid'));
      } else {
        setError(t('resetFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold">{t('forgotTitle')}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t('forgotSubtitleOtp')}</p>

        {step === 'email' ? (
          <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="mt-8 space-y-4">
            <input type="email" required className="input" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? '...' : t('sendCode')}</button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="mt-8 space-y-4">
            <p className="text-sm text-zinc-500">{t('codeSentTo', { email })}</p>
            <input
              className="input font-mono tracking-widest"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <input type="password" required minLength={8} className="input" placeholder={t('newPassword')} value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">{loading ? '...' : t('resetPasswordButton')}</button>
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={sendCode}
              className="w-full text-sm text-blue-400 hover:underline disabled:text-zinc-600"
            >
              {cooldown > 0 ? `${t('resendCode')} (${cooldown}s)` : t('resendCode')}
            </button>
          </form>
        )}

        <Link href="/login" className="mt-4 inline-block text-sm text-blue-400">{t('loginLink')}</Link>
      </div>
    </div>
  );
}
