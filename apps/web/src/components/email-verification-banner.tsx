'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Mail } from 'lucide-react';

export function EmailVerificationBanner() {
  const [unverified, setUnverified] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ user: { emailVerifiedAt?: string | null } }>('/api/v1/me')
      .then((d) => setUnverified(!d.user.emailVerifiedAt))
      .catch(() => {});
  }, []);

  if (!unverified) return null;

  const resend = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/v1/me/verify-email/resend', { method: 'POST' });
      setSent(true);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 shrink-0" />
        <span>请验证邮箱以解锁更多监控（未验证限 3 个）</span>
      </div>
      <button type="button" onClick={resend} disabled={loading || sent} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-60">
        {sent ? '已发送' : loading ? '...' : '重新发送验证邮件'}
      </button>
    </div>
  );
}
