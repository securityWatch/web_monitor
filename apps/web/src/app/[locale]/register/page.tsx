'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch, setStoredAuth, ApiError } from '@/lib/api';
import type { AuthData } from '@/lib/api';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', confirm: '', displayName: '', code: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [wechatEnabled, setWechatEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/wechat/miniprogram/status')
      .then((r) => r.json())
      .then((d) => setWechatEnabled(!!d.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendCode = useCallback(async () => {
    if (!form.email.trim()) {
      setError(t('emailRequired'));
      return;
    }
    setCodeSending(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/register/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      });
      setCodeSent(true);
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_RATE_LIMIT') {
        setError(t('otpRateLimit'));
      } else if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_EXISTS') {
        setError(t('emailAlreadyExists'));
      } else {
        setError(err instanceof Error ? err.message : t('otpSendFailed'));
      }
    } finally {
      setCodeSending(false);
    }
  }, [form.email, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    if (form.code.length !== 6) {
      setError(t('otpRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AuthData>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          code: form.code,
        }),
      });
      setStoredAuth(data);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_OTP') {
        setError(t('otpInvalid'));
      } else {
        setError(err instanceof Error ? err.message : t('loginError'));
      }
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

        {wechatEnabled && (
          <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
            {t('wechatRegisterHint')}
          </p>
        )}

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
            <label className="mb-1 block text-sm text-zinc-400">{t('emailCode')}</label>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono tracking-widest"
                placeholder="000000"
                maxLength={6}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              />
              <button
                type="button"
                disabled={codeSending || cooldown > 0 || !form.email}
                onClick={sendCode}
                className="btn-secondary shrink-0 px-3 text-sm"
              >
                {codeSending ? '...' : cooldown > 0 ? `${cooldown}s` : codeSent ? t('resendCode') : t('sendCode')}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-600">{t('codeHint')}</p>
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
