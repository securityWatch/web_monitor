'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Shield } from 'lucide-react';

export function TotpSettings() {
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ enabled: boolean }>('/api/v1/me/totp').then((d) => setEnabled(d.enabled)).catch(() => {});
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ secret: string; uri: string }>('/api/v1/me/totp/setup', { method: 'POST' });
      setSetup(data);
      setMsg('');
    } catch {
      setMsg('设置失败');
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/v1/me/totp/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setEnabled(true);
      setSetup(null);
      setCode('');
      setMsg('双因素认证已启用');
    } catch {
      setMsg('验证码错误');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!confirm('确定关闭双因素认证？')) return;
    await apiFetch('/api/v1/me/totp/disable', { method: 'POST' });
    setEnabled(false);
    setSetup(null);
    setMsg('双因素认证已关闭');
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-blue-500" />
        <h2 className="font-semibold">双因素认证 (2FA)</h2>
      </div>
      <p className="text-sm text-zinc-400">
        使用 Google Authenticator 等 TOTP 应用保护账户登录。
      </p>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {enabled ? (
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">已启用</span>
          <button type="button" onClick={disable} className="btn-secondary text-sm text-red-400">
            关闭 2FA
          </button>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">在验证器应用中扫描或手动输入密钥：</p>
          <code className="block break-all rounded bg-zinc-900 p-2 text-xs">{setup.secret}</code>
          <p className="text-xs text-zinc-500 break-all">{setup.uri}</p>
          <input
            className="input"
            placeholder="6 位验证码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
          <button type="button" onClick={enable} disabled={loading || code.length < 6} className="btn-primary">
            确认启用
          </button>
        </div>
      ) : (
        <button type="button" onClick={startSetup} disabled={loading} className="btn-primary">
          设置 2FA
        </button>
      )}
    </div>
  );
}
