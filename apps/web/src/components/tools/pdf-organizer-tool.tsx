'use client';

import { useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Files } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { downloadBlob, ToolHero } from '@/components/tools/tool-shell';

type Mode = 'merge' | 'extract';

export function PdfOrganizerTool() {
  const t = useTranslations('extraTools.pdf');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>('merge');
  const [range, setRange] = useState('1');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; name: string; pages: number } | null>(null);

  const run = async () => {
    setError('');
    setResult(null);
    if (files.length === 0) return setError(t('noFile'));
    try {
      setStatus(t('processing'));
      const out = await PDFDocument.create();
      if (mode === 'merge') {
        for (const file of files) {
          const src = await PDFDocument.load(await file.arrayBuffer());
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
        }
      } else {
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const indices = parseRange(range, src.getPageCount());
        const pages = await out.copyPages(src, indices);
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      setResult({ blob: new Blob([arrayBuffer], { type: 'application/pdf' }), name: mode === 'merge' ? 'merged.pdf' : 'extracted.pdf', pages: out.getPageCount() });
      setStatus(t('done'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <ToolHero badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <input ref={fileRef} multiple type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        <button type="button" className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8" onClick={() => fileRef.current?.click()}>
          <Files className="h-10 w-10 text-blue-400" />
          <span className="mt-4 font-semibold">{t('choose')}</span>
          <span className="mt-2 text-sm text-zinc-500">{files.length ? files.map((f) => f.name).join(', ') : t('hint')}</span>
        </button>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-400">{t('mode')}<select className="input mt-1" value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="merge">{t('merge')}</option><option value="extract">{t('extract')}</option></select></label>
          <label className="text-sm text-zinc-400 sm:col-span-2">{t('range')}<input className="input mt-1" disabled={mode === 'merge'} value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3,5" /></label>
        </div>
        <button type="button" className="btn-primary mt-6" onClick={run}>{t('run')}</button>
        {status && <p className="mt-4 text-sm text-zinc-400">{status}</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {result && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p>{t('result', { pages: result.pages })}</p><button className="btn-primary inline-flex items-center gap-2" onClick={() => downloadBlob(result.blob, result.name)}><Download className="h-4 w-4" />{t('download')}</button></div>}
      </div>
    </div>
  );
}

function parseRange(input: string, pageCount: number) {
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const [a, b] = part.split('-').map((n) => Number(n.trim()));
    if (!Number.isFinite(a)) continue;
    const start = Math.max(1, Math.min(pageCount, a));
    const end = Number.isFinite(b) ? Math.max(start, Math.min(pageCount, b)) : start;
    for (let i = start; i <= end; i++) out.add(i - 1);
  }
  if (out.size === 0) out.add(0);
  return [...out];
}
