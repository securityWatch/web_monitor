'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { MarketingNav } from '@/components/marketing-nav';
import { CheckCircle, XCircle } from 'lucide-react';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? setStatus('ok') : setStatus('error')))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <MarketingNav />
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        {status === 'loading' && <p className="text-zinc-400">验证中...</p>}
        {status === 'ok' && (
          <>
            <CheckCircle className="h-12 w-12 text-emerald-400" />
            <h1 className="mt-4 text-2xl font-bold text-white">邮箱已验证</h1>
            <p className="mt-2 text-sm text-zinc-400">您现在可以创建更多监控了。</p>
            <Link href="/dashboard" className="btn-primary mt-8 px-6 py-2.5">进入控制台</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-400" />
            <h1 className="mt-4 text-2xl font-bold text-white">验证失败</h1>
            <p className="mt-2 text-sm text-zinc-400">链接无效或已过期，请在设置中重新发送验证邮件。</p>
            <Link href="/settings" className="btn-primary mt-8 px-6 py-2.5">前往设置</Link>
          </>
        )}
      </div>
    </div>
  );
}
