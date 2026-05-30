'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { apiFetch, setStoredAuth, ApiError, type AuthData } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const totpToken = searchParams.get('totp');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [mode, setMode] = useState<'password' | 'magic' | 'totp'>(totpToken ? 'totp' : 'password');
  const [magicSent, setMagicSent] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState(totpToken || '');

  useEffect(() => {
    fetch('/api/v1/auth/providers')
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
    if (searchParams.get('error') === 'magic') {
      setError('登录链接无效或已过期');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AuthData>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.requiresTotp && data.tempToken) {
        setTempToken(data.tempToken);
        setMode('totp');
        return;
      }
      setStoredAuth(data);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_LOCKED') {
        const secs = err.retryAfterSeconds ?? 900;
        const mins = Math.max(1, Math.ceil(secs / 60));
        setError(t('accountLocked', { minutes: mins }));
      } else {
        setError(t('loginError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMagicSent(true);
    } catch {
      setError('发送失败');
    } finally {
      setLoading(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AuthData>('/api/v1/auth/totp', {
        method: 'POST',
        body: JSON.stringify({ tempToken, code: totpCode }),
      });
      setStoredAuth(data);
      router.push('/dashboard');
    } catch {
      setError('验证码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="text-2xl font-bold text-white">
          {mode === 'totp' ? '双因素验证' : t('loginTitle')}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {mode === 'totp' ? '请输入验证器应用中的 6 位验证码' : t('loginSubtitle')}
        </p>

        {mode === 'totp' ? (
          <form onSubmit={submitTotp} className="mt-8 space-y-4">
            <input
              className="input text-center font-mono text-lg tracking-widest"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading || totpCode.length < 6} className="btn-primary w-full py-2.5">
              {loading ? '...' : '验证'}
            </button>
            <button type="button" onClick={() => { setMode('password'); setTotpCode(''); }} className="w-full text-sm text-zinc-500 hover:text-white">
              返回密码登录
            </button>
          </form>
        ) : mode === 'magic' ? (
          <form onSubmit={sendMagicLink} className="mt-8 space-y-4">
            {magicSent ? (
              <p className="text-sm text-emerald-400">若该邮箱存在，登录链接已发送至邮箱，请查收。</p>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm text-zinc-400">{t('email')}</label>
                  <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                  {loading ? '...' : '发送 Magic Link'}
                </button>
              </>
            )}
            <button type="button" onClick={() => { setMode('password'); setMagicSent(false); }} className="w-full text-sm text-zinc-500 hover:text-white">
              使用密码登录
            </button>
          </form>
        ) : (
          <>
            {(providers.includes('google') || providers.includes('github')) && (
              <div className="mt-6 flex flex-col gap-2">
                {providers.includes('google') && (
                  <button type="button" onClick={() => { window.location.href = '/api/v1/auth/oauth/google'; }} className="btn-secondary w-full py-2.5">Google 登录</button>
                )}
                {providers.includes('github') && (
                  <button type="button" onClick={() => { window.location.href = '/api/v1/auth/oauth/github'; }} className="btn-secondary w-full py-2.5">GitHub 登录</button>
                )}
                <p className="text-center text-xs text-zinc-600">或</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

            <button type="button" onClick={() => setMode('magic')} className="mt-4 w-full text-center text-sm text-blue-400 hover:underline">
              使用 Magic Link 登录
            </button>
          </>
        )}

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
