'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ToolHero } from '@/components/tools/tool-shell';

export function JwtDecoderTool() {
  const t = useTranslations('extraTools.jwt');
  const [token, setToken] = useState('');
  const decoded = useMemo(() => decodeJwt(token), [token]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <textarea className="input min-h-[150px] font-mono text-sm" placeholder={t('placeholder')} value={token} onChange={(e) => setToken(e.target.value)} />
        {decoded.error && <p className="mt-4 text-sm text-red-400">{decoded.error}</p>}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel title={t('header')} value={decoded.header} />
          <Panel title={t('payload')} value={decoded.payload} />
        </div>
        {decoded.exp && <p className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${decoded.exp.expired ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}><ShieldCheck className="h-4 w-4" />{decoded.exp.label}</p>}
        <p className="mt-4 text-xs text-zinc-500">{t('privacy')}</p>
      </div>
    </div>
  );
}

function Panel({ title, value }: { title: string; value: string }) {
  return <div><p className="mb-2 text-sm text-zinc-400">{title}</p><pre className="min-h-[220px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-300">{value || '{}'}</pre></div>;
}

function decodeJwt(token: string): { header: string; payload: string; error?: string; exp?: { expired: boolean; label: string } } {
  if (!token.trim()) return { header: '', payload: '' };
  try {
    const parts = token.trim().split('.');
    if (parts.length < 3 || parts.some((part) => part.length === 0)) {
      return { header: '', payload: '' };
    }
    const [h, p] = parts;
    const header = JSON.parse(base64UrlDecode(h));
    const payload = JSON.parse(base64UrlDecode(p));
    let exp;
    if (typeof payload.exp === 'number') {
      const d = new Date(payload.exp * 1000);
      const expired = d.getTime() < Date.now();
      exp = { expired, label: `${expired ? 'Expired' : 'Expires'}: ${d.toLocaleString()}` };
    }
    return { header: JSON.stringify(header, null, 2), payload: JSON.stringify(payload, null, 2), exp };
  } catch (err) {
    return { header: '', payload: '', error: err instanceof Error ? `Invalid JWT: ${err.message}` : 'Invalid JWT' };
  }
}

function base64UrlDecode(input = '') {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return decodeURIComponent(escape(atob(normalized)));
}
