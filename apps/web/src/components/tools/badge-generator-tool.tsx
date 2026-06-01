'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ToolHero } from '@/components/tools/tool-shell';
import { BadgeCheck, Copy, Check, Github, FileCode } from 'lucide-react';

const DEMO_TOKEN = 'demo';

export function BadgeGeneratorTool() {
  const t = useTranslations('extraTools.badgeGenerator');
  const [copied, setCopied] = useState<'markdown' | 'html' | null>(null);

  const markdownCode = `![PulseWatch](https://gkao.com.cn/api/v1/public/badge/${DEMO_TOKEN}.svg)`;
  const htmlCode = `<img src="https://gkao.com.cn/api/v1/public/badge/${DEMO_TOKEN}.svg" alt="PulseWatch uptime badge" />`;

  const copyCode = async (format: 'markdown' | 'html') => {
    const code = format === 'markdown' ? markdownCode : htmlCode;
    await navigator.clipboard.writeText(code);
    setCopied(format);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <ToolHero
          badge={t('badge')}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        {/* Live preview */}
        <div className="mt-10 card border-zinc-800 bg-zinc-900/40 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-emerald-400" />
                Live preview
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                This badge updates in real time based on your monitor status.
                Green means your service is UP, red means DOWN.
              </p>
              <div className="mt-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://gkao.com.cn/api/v1/public/badge/${DEMO_TOKEN}.svg`}
                  alt="Demo uptime badge"
                  className="h-5"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-300">{t('markdown')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCode('markdown')}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    {copied === 'markdown' ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto text-xs text-zinc-300 font-mono">{markdownCode}</pre>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-300">{t('html')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCode('html')}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    {copied === 'html' ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto text-xs text-zinc-300 font-mono">{htmlCode}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <span className="text-lg font-bold">1</span>
            </div>
            <h3 className="mt-4 font-semibold">Create a monitor</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Sign up for PulseWatch and add an HTTP, TCP, Ping, or any other monitor type
              for the service you want to track.
            </p>
          </div>
          <div className="card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <span className="text-lg font-bold">2</span>
            </div>
            <h3 className="mt-4 font-semibold">Wait for first check</h3>
            <p className="mt-2 text-sm text-zinc-400">
              After the first check completes, PulseWatch automatically generates a unique
              public badge token for your monitor.
            </p>
          </div>
          <div className="card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <span className="text-lg font-bold">3</span>
            </div>
            <h3 className="mt-4 font-semibold">Embed anywhere</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Copy the Markdown or HTML embed code from your monitor detail page and paste it
              into your GitHub README, website, or dashboard.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-10 card border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Why use uptime badges?</h2>
          <ul className="mt-6 space-y-4">
            <li className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium text-white">Real-time status at a glance</p>
                <p className="text-sm text-zinc-400">Visitors see UP (green) or DOWN (red) without navigating away from your README or landing page.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Github className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
              <div>
                <p className="font-medium text-white">GitHub README native</p>
                <p className="text-sm text-zinc-400">Markdown image syntax works seamlessly in GitHub, GitLab, Bitbucket, and most markdown renderers.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <FileCode className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
              <div>
                <p className="font-medium text-white">HTML embed for any site</p>
                <p className="text-sm text-zinc-400">Use the standard <code className="text-blue-300">&lt;img&gt;</code> tag to embed the badge in documentation sites, dashboards, or company status pages.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium text-white">Secure token</p>
                <p className="text-sm text-zinc-400">Each monitor gets a unique, unguessable token. Regenerate it anytime from the monitor detail page if you need to rotate access.</p>
              </div>
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <p className="text-lg text-zinc-300">{t('cta')}</p>
          <Link
            href="/register"
            className="btn-primary mt-4 inline-flex items-center gap-2 px-6 py-3 text-base"
          >
            Start free — no credit card
          </Link>
          <p className="mt-3 text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
              Log in
            </Link>
            {' '}to get your badge.
          </p>
        </div>
      </div>
    </section>
  );
}
