'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, getStoredAuth } from '@/lib/api';

export function OnboardingWizard() {
  const router = useRouter();
  const auth = getStoredAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ user: { onboardingDone?: boolean } }>('/api/v1/me')
      .then((d) => { if (d.user.onboardingDone) router.push('/dashboard'); })
      .catch(() => {});
  }, [router]);

  const finish = async () => {
    await apiFetch('/api/v1/me/onboarding/complete', { method: 'POST' });
    router.push('/dashboard');
  };

  const createMonitor = async () => {
    if (!auth?.organization.id) return;
    setLoading(true);
    try {
      await apiFetch(`/api/v1/orgs/${auth.organization.id}/monitors`, {
        method: 'POST',
        body: JSON.stringify({ name, targetUrl: url, type: 'http', intervalSeconds: 300 }),
      });
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  if (!auth) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
        <p className="text-sm text-blue-400">步骤 {step} / 3</p>
        <h2 className="mt-2 text-xl font-bold text-white">
          {step === 1 && '添加第一个监控'}
          {step === 2 && '配置告警集成'}
          {step === 3 && '发布状态页'}
        </h2>

        {step === 1 && (
          <div className="mt-4 space-y-3">
            <input className="input" placeholder="监控名称" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input font-mono" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button onClick={createMonitor} disabled={loading || !name || !url} className="btn-primary w-full">
              {loading ? '...' : '创建并继续'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-400">前往设置 → 集成，添加 Webhook / Slack / Discord / PagerDuty。</p>
            <button onClick={() => setStep(3)} className="btn-primary w-full">已配置，继续</button>
            <button onClick={() => router.push('/settings')} className="btn-secondary w-full">打开集成设置</button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-400">创建公开状态页，向用户展示服务可用性。</p>
            <button onClick={finish} className="btn-primary w-full">完成向导</button>
            <button onClick={() => router.push('/status-pages')} className="btn-secondary w-full">创建状态页</button>
          </div>
        )}
      </div>
    </div>
  );
}
