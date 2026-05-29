'use client';

import { useState } from 'react';
import { MarketingNav } from '@/components/marketing-nav';

interface SSLResult {
  host: string;
  valid: boolean;
  issuer?: string;
  subject?: string;
  expiresAt?: string;
  daysLeft?: number;
  tlsVersion?: string;
  error?: string;
}

export default function SSLCheckerPage() {
  const [host, setHost] = useState('');
  const [result, setResult] = useState<SSLResult | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/public/ssl-check?host=${encodeURIComponent(host.trim())}`);
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-bold">免费 SSL 证书检测</h1>
        <p className="mt-2 text-zinc-400">检查 HTTPS 证书有效期、颁发者与 TLS 版本</p>
        <form onSubmit={check} className="mt-8 flex gap-2">
          <input className="input flex-1 font-mono" placeholder="example.com" value={host} onChange={(e) => setHost(e.target.value)} />
          <button type="submit" disabled={loading} className="btn-primary px-6">{loading ? '...' : '检测'}</button>
        </form>
        {result && (
          <div className={`mt-6 card ${result.valid ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
            <p className="text-lg font-semibold">{result.host}</p>
            <p className={result.valid ? 'text-emerald-400' : 'text-red-400'}>{result.valid ? '证书有效' : '证书无效或无法连接'}</p>
            {result.error && <p className="mt-2 text-sm text-zinc-500">{result.error}</p>}
            {result.expiresAt && (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-500">到期</dt><dd>{result.expiresAt}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">剩余天数</dt><dd>{result.daysLeft}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">颁发者</dt><dd>{result.issuer}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">TLS</dt><dd>{result.tlsVersion}</dd></div>
              </dl>
            )}
            <p className="mt-6 text-xs text-zinc-600">注册 PulseWatch 可在证书到期前自动收到邮件提醒</p>
          </div>
        )}
      </div>
    </div>
  );
}
