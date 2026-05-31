'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  ArrowLeftRight,
  Braces,
  Binary,
  Clock,
  Copy,
  Link2,
  Quote,
  Trash2,
  Check,
  FileText,
  ImageIcon,
  QrCode,
  ShieldCheck,
  CalendarClock,
  Files,
} from 'lucide-react';
import {
  base64Decode,
  base64Encode,
  dateToTimestamp,
  escapeJsonString,
  formatJson,
  minifyJson,
  timestampToDate,
  unescapeJsonString,
  urlDecode,
  urlEncode,
  validateJson,
} from '@/components/dev-tools/utils';

type ToolId = 'json' | 'escape' | 'base64' | 'url' | 'timestamp';
type JsonAction = 'format' | 'minify' | 'validate';
type EscapeAction = 'escape' | 'unescape';
type Base64Action = 'encode' | 'decode';
type UrlAction = 'encode' | 'decode';
type TimestampAction = 'toDate' | 'toTimestamp';
type TimestampUnit = 'ms' | 's';

const TOOLS: { id: ToolId; icon: typeof Braces }[] = [
  { id: 'json', icon: Braces },
  { id: 'escape', icon: Quote },
  { id: 'base64', icon: Binary },
  { id: 'url', icon: Link2 },
  { id: 'timestamp', icon: Clock },
];

const EXTRA_TOOLS = [
  { href: '/tools/image-compress', key: 'imageCompress', icon: ImageIcon },
  { href: '/tools/pdf-tools', key: 'pdfTools', icon: Files },
  { href: '/tools/pdf-to-word', key: 'pdfToWord', icon: FileText },
  { href: '/tools/qr-code', key: 'qrCode', icon: QrCode },
  { href: '/tools/jwt-decoder', key: 'jwtDecoder', icon: ShieldCheck },
  { href: '/tools/cron-parser', key: 'cronParser', icon: CalendarClock },
];

export function DevToolsPanel() {
  const t = useTranslations('homeTools');
  const placeholders: Record<ToolId, string> = {
    json: t('placeholderJson'),
    escape: t('placeholderEscape'),
    base64: t('placeholderBase64'),
    url: t('placeholderUrl'),
    timestamp: t('placeholderTimestamp'),
  };
  const hints: Record<ToolId, string> = {
    json: t('hints.json'),
    escape: t('hints.escape'),
    base64: t('hints.base64'),
    url: t('hints.url'),
    timestamp: t('hints.timestamp'),
  };
  const [activeTool, setActiveTool] = useState<ToolId>('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [jsonAction, setJsonAction] = useState<JsonAction>('format');
  const [escapeAction, setEscapeAction] = useState<EscapeAction>('escape');
  const [base64Action, setBase64Action] = useState<Base64Action>('encode');
  const [urlAction, setUrlAction] = useState<UrlAction>('encode');
  const [timestampAction, setTimestampAction] = useState<TimestampAction>('toDate');
  const [timestampUnit, setTimestampUnit] = useState<TimestampUnit>('ms');

  const runTransform = useCallback(() => {
    setError(null);
    setCopied(false);
    let result;
    switch (activeTool) {
      case 'json':
        result = jsonAction === 'format' ? formatJson(input) : jsonAction === 'minify' ? minifyJson(input) : validateJson(input);
        break;
      case 'escape':
        result = escapeAction === 'escape' ? escapeJsonString(input) : unescapeJsonString(input);
        break;
      case 'base64':
        result = base64Action === 'encode' ? base64Encode(input) : base64Decode(input);
        break;
      case 'url':
        result = urlAction === 'encode' ? urlEncode(input) : urlDecode(input);
        break;
      case 'timestamp':
        result = timestampAction === 'toDate'
          ? timestampToDate(input, timestampUnit)
          : dateToTimestamp(input, timestampUnit);
        break;
    }
    setOutput(result.output);
    setError(result.error ?? null);
  }, [activeTool, input, jsonAction, escapeAction, base64Action, urlAction, timestampAction, timestampUnit]);

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError(null);
    setCopied(false);
  };

  const handleSwap = () => {
    setInput(output);
    setOutput('');
    setError(null);
    setCopied(false);
  };

  const switchTool = (id: ToolId) => {
    setActiveTool(id);
    setOutput('');
    setError(null);
    setCopied(false);
  };

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">{t('title')}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-zinc-400">{t('subtitle')}</p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {TOOLS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => switchTool(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors sm:px-5 sm:py-3 sm:text-base ${
                activeTool === id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'border border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              {t(`tabs.${id}`)}
            </button>
          ))}
          {EXTRA_TOOLS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-100 transition-colors hover:border-blue-400 hover:bg-blue-500/20 sm:px-5 sm:py-3 sm:text-base"
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              {t(`tabs.${key}`)}
            </Link>
          ))}
        </div>

        <div className="mt-6 card border-zinc-800 bg-zinc-900/40 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {activeTool === 'json' && (
              <>
                {(['format', 'minify', 'validate'] as const).map((action) => (
                  <ActionChip key={action} active={jsonAction === action} onClick={() => setJsonAction(action)} label={t(`json.${action}`)} />
                ))}
              </>
            )}
            {activeTool === 'escape' && (
              <>
                {(['escape', 'unescape'] as const).map((action) => (
                  <ActionChip key={action} active={escapeAction === action} onClick={() => setEscapeAction(action)} label={t(`escape.${action}`)} />
                ))}
              </>
            )}
            {activeTool === 'base64' && (
              <>
                {(['encode', 'decode'] as const).map((action) => (
                  <ActionChip key={action} active={base64Action === action} onClick={() => setBase64Action(action)} label={t(`base64.${action}`)} />
                ))}
              </>
            )}
            {activeTool === 'url' && (
              <>
                {(['encode', 'decode'] as const).map((action) => (
                  <ActionChip key={action} active={urlAction === action} onClick={() => setUrlAction(action)} label={t(`url.${action}`)} />
                ))}
              </>
            )}
            {activeTool === 'timestamp' && (
              <>
                {(['toDate', 'toTimestamp'] as const).map((action) => (
                  <ActionChip key={action} active={timestampAction === action} onClick={() => setTimestampAction(action)} label={t(`timestamp.${action}`)} />
                ))}
                <span className="mx-1 hidden h-5 w-px bg-zinc-700 sm:inline" />
                {(['ms', 's'] as const).map((unit) => (
                  <ActionChip
                    key={unit}
                    active={timestampUnit === unit}
                    onClick={() => setTimestampUnit(unit)}
                    label={unit === 'ms' ? t('timestampUnitMs') : t('timestampUnitS')}
                    small
                  />
                ))}
              </>
            )}

            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={runTransform} className="btn-primary px-5 py-2.5 text-base">
                {t('transform')}
              </button>
              <button type="button" onClick={handleCopy} disabled={!output} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 disabled:opacity-40">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? t('copied') : t('copy')}
              </button>
              <button type="button" onClick={handleSwap} disabled={!output} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 disabled:opacity-40">
                <ArrowLeftRight className="h-4 w-4" />
                {t('swap')}
              </button>
              <button type="button" onClick={handleClear} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5">
                <Trash2 className="h-4 w-4" />
                {t('clear')}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-400 sm:text-base">
              {error}
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6">
            <Panel label={t('input')} hint={hints[activeTool]}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholders[activeTool]}
                spellCheck={false}
                className="w-full min-h-[360px] flex-1 resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 font-mono text-base leading-relaxed text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:p-6 sm:text-lg lg:min-h-[480px] lg:h-[50vh] lg:max-h-[40rem]"
              />
            </Panel>
            <Panel label={t('output')} hint={t('outputHint')}>
              <textarea
                value={output}
                readOnly
                placeholder={t('outputPlaceholder')}
                spellCheck={false}
                className="w-full min-h-[360px] flex-1 resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 font-mono text-base leading-relaxed text-zinc-300 placeholder:text-zinc-600 focus:outline-none sm:p-6 sm:text-lg lg:min-h-[480px] lg:h-[50vh] lg:max-h-[40rem]"
              />
            </Panel>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600">{t('privacyNote')}</p>
      </div>
    </section>
  );
}

function Panel({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-300 sm:text-base">{label}</span>
        <span className="text-xs text-zinc-600 sm:text-sm">{hint}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ActionChip({
  active,
  onClick,
  label,
  small,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg font-medium transition-colors ${
        small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm sm:text-base'
      } ${
        active
          ? 'bg-zinc-700 text-white'
          : 'border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}
