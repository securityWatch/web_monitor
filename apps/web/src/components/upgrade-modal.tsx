'use client';

import { Link } from '@/i18n/navigation';
import { getStoredAuth } from '@/lib/api';
import { X, Zap } from 'lucide-react';

export function UpgradeModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason: 'quota' | 'email';
}) {
  if (!open) return null;
  const auth = getStoredAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card relative max-w-md space-y-4">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-zinc-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        {reason === 'quota' ? (
          <>
            <div className="flex items-center gap-2 text-amber-400">
              <Zap className="h-5 w-5" />
              <h2 className="text-lg font-semibold">监控配额已满</h2>
            </div>
            <p className="text-sm text-zinc-400">
              当前套餐最多 {auth?.organization.monitorQuota ?? 10} 个监控。升级 Pro 创始价仅需 $1/月，解锁 50 个监控。
            </p>
            <Link href="/settings" onClick={onClose} className="btn-primary block w-full text-center">
              升级 Pro — $1/月
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">请先验证邮箱</h2>
            <p className="text-sm text-zinc-400">
              未验证邮箱的账户最多创建 3 个监控。请查收验证邮件或前往设置重新发送。
            </p>
            <Link href="/settings" onClick={onClose} className="btn-primary block w-full text-center">
              前往设置验证
            </Link>
          </>
        )}
        <button type="button" onClick={onClose} className="btn-secondary w-full">
          稍后再说
        </button>
      </div>
    </div>
  );
}
