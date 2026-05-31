'use client';

import { useRef, useState } from 'react';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { Download, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ConversionResult {
  fileName: string;
  pageCount: number;
  paragraphCount: number;
  blob: Blob;
  warning?: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export function PdfToWordTool() {
  const t = useTranslations('pdfToWord');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [converting, setConverting] = useState(false);

  const convert = async (file: File) => {
    setError('');
    setResult(null);
    setStatus('');
    setFileName(safeFileName(file.name));
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(t('errors.notPdf'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t('errors.tooLarge'));
      return;
    }

    setConverting(true);
    setStatus(t('status.reading'));
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pages: string[][] = [];

      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
        setStatus(t('status.page', { page: pageIndex, total: pdf.numPages }));
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => {
            const textItem = item as { str?: unknown };
            return typeof textItem.str === 'string' ? textItem.str : '';
          })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pages.push(splitParagraphs(text));
      }

      const paragraphCount = pages.reduce((sum, p) => sum + p.length, 0);
      if (paragraphCount === 0) {
        setError(t('errors.noText'));
        return;
      }

      setStatus(t('status.word'));
      const doc = buildDocx(file.name, pages);
      const blob = await Packer.toBlob(doc);
      setResult({
        fileName: wordFileName(file.name),
        pageCount: pdf.numPages,
        paragraphCount,
        blob,
        warning: paragraphCount < pdf.numPages ? t('warnings.lowText') : undefined,
      });
      setStatus(t('status.done'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setConverting(false);
    }
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
          <FileText className="h-3.5 w-3.5" />
          {t('badge')}
        </div>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{t('title')}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-400">{t('subtitle')}</p>
      </div>

      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void convert(file);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setStatus('');
            setError('');
            setResult(null);
            setFileName('');
            inputRef.current?.click();
          }}
          disabled={converting}
          className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center transition hover:border-blue-500/60 disabled:opacity-70"
        >
          <Upload className="h-10 w-10 text-blue-400" />
          <span className="mt-4 text-lg font-semibold">{t('dropTitle')}</span>
          <span className="mt-2 text-sm text-zinc-500">{t('dropHint')}</span>
          {fileName && <span className="mt-4 rounded-full bg-zinc-800 px-3 py-1 font-mono text-xs text-zinc-300">{fileName}</span>}
        </button>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoCard label={t('privacyTitle')} value={t('privacyValue')} />
          <InfoCard label={t('outputTitle')} value={t('outputValue')} />
          <InfoCard label={t('limitTitle')} value={t('limitValue')} />
        </div>

        {(status || error || result) && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            {status && <p className="text-sm text-zinc-300">{status}</p>}
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            {result?.warning && <p className="mt-2 text-sm text-amber-300">{result.warning}</p>}
            {result && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  {t('result', { pages: result.pageCount, paragraphs: result.paragraphCount })}
                </p>
                <button type="button" onClick={download} className="btn-primary inline-flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  {t('download')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-2 text-sm text-zinc-300">{value}</p>
    </div>
  );
}

function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[。！？.!?])\s+|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function buildDocx(fileName: string, pages: string[][]) {
  const children: Paragraph[] = [
    new Paragraph({
      text: fileName.replace(/\.pdf$/i, ''),
      heading: HeadingLevel.TITLE,
    }),
  ];

  pages.forEach((paragraphs, index) => {
    children.push(new Paragraph({ text: `Page ${index + 1}`, heading: HeadingLevel.HEADING_2 }));
    for (const paragraph of paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun(paragraph)],
          spacing: { after: 160 },
        }),
      );
    }
  });

  return new Document({ sections: [{ children }] });
}

function wordFileName(fileName: string): string {
  return safeFileName(fileName).replace(/\.pdf$/i, '') + '.docx';
}

function safeFileName(fileName: string): string {
  return fileName.split(/[/\\]/).pop() || 'converted.pdf';
}
