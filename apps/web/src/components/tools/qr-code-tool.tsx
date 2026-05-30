'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ToolHero } from '@/components/tools/tool-shell';

export function QrCodeTool() {
  const t = useTranslations('extraTools.qr');
  const [text, setText] = useState('https://pulsewatch.io');
  const [size, setSize] = useState(320);
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text || ' ', { width: size, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) { setDataUrl(url); setError(''); } })
      .catch((err) => setError(err instanceof Error ? err.message : 'QR error'));
    return () => { cancelled = true; };
  }, [text, size]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <label className="text-sm text-zinc-400">{t('content')}<textarea className="input mt-2 min-h-[180px]" value={text} onChange={(e) => setText(e.target.value)} /></label>
          <label className="mt-4 block text-sm text-zinc-400">{t('size')}<input className="input mt-2" type="number" min={160} max={1024} value={size} onChange={(e) => setSize(Number(e.target.value) || 320)} /></label>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          {dataUrl ? (
            // Data URLs are generated locally and cannot be optimized by next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR code" className="mx-auto rounded-xl bg-white p-3" />
          ) : <QrCode className="mx-auto h-32 w-32 text-zinc-600" />}
          <a href={dataUrl} download="qrcode.png" className="btn-primary mt-6 inline-flex items-center gap-2"><Download className="h-4 w-4" />{t('download')}</a>
        </div>
      </div>
    </div>
  );
}
