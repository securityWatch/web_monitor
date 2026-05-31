'use client';

import { useRef, useState } from 'react';
import { Download, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { downloadBlob, ToolHero } from '@/components/tools/tool-shell';

type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png';

export function ImageCompressTool() {
  const t = useTranslations('extraTools.image');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [quality, setQuality] = useState(0.82);
  const [maxWidth, setMaxWidth] = useState(1600);
  const [format, setFormat] = useState<OutputFormat>('image/webp');
  const [result, setResult] = useState<{ blob: Blob; name: string; before: number; after: number } | null>(null);
  const [error, setError] = useState('');

  const convert = async (file: File) => {
    setError('');
    setResult(null);
    if (!file.type.startsWith('image/')) {
      setError(t('notImage'));
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxWidth / bitmap.width);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Convert failed'))), format, quality);
      });
      setResult({ blob, name: outputName(file.name, format), before: file.size, after: blob.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && convert(e.target.files[0])} />
        <button type="button" className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-10 w-10 text-blue-400" />
          <span className="mt-4 font-semibold">{t('choose')}</span>
          <span className="mt-2 text-sm text-zinc-500">{t('hint')}</span>
        </button>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-400">{t('format')}<select className="input mt-1" value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></label>
          <label className="text-sm text-zinc-400">{t('quality')}<input className="input mt-1" type="number" min={10} max={100} value={Math.round(quality * 100)} onChange={(e) => setQuality(Number(e.target.value) / 100)} /></label>
          <label className="text-sm text-zinc-400">{t('maxWidth')}<input className="input mt-1" type="number" min={100} max={8000} value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value) || 1600)} /></label>
        </div>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {result && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-sm text-zinc-300">{t('saved', { before: kb(result.before), after: kb(result.after), pct: Math.max(0, Math.round((1 - result.after / result.before) * 100)) })}</p>
            <button className="btn-primary inline-flex items-center gap-2" onClick={() => downloadBlob(result.blob, result.name)}><Download className="h-4 w-4" />{t('download')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function outputName(name: string, format: OutputFormat) {
  const ext = format === 'image/webp' ? 'webp' : format === 'image/jpeg' ? 'jpg' : 'png';
  return name.replace(/\.[^.]+$/, '') + '.' + ext;
}

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}
