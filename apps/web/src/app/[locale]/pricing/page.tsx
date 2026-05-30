'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing-nav';
import { Link } from '@/i18n/navigation';
import { Activity, Zap } from 'lucide-react';

const FAQ = [
  { q: '免费版有什么限制？', a: '免费版包含 15 个监控、邮件告警与公开状态页，适合个人项目。' },
  { q: '创始会员价是什么？', a: 'Pro 创始价 $1/月终身锁价（原价 $12），名额有限，含 50 个监控。' },
  { q: '可以随时取消吗？', a: '可以，随时在账单设置中取消，无长期合约。' },
  { q: '支持哪些监控类型？', a: 'HTTP/HTTPS、TCP、Ping、关键词、SSL 到期、DNS、Heartbeat 等。' },
];

export default function PricingPage() {
  const t = useTranslations('landing');
  const [foundingCount, setFoundingCount] = useState(5000);

  useEffect(() => {
    fetch('/api/v1/public/founding-count')
      .then((r) => r.json())
      .then((d) => setFoundingCount(d.remaining ?? 5000))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify(schema);
    el.id = 'pricing-faq-schema';
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  const plans = [
    { name: t('planFree'), price: '$0', founding: null, monitors: 15 },
    { name: t('planPro'), price: '$1', founding: '$12', monitors: 50, popular: true },
    { name: t('planTeam'), price: '$4', founding: '$39', monitors: 150 },
    { name: t('planBusiness'), price: '$10', founding: '$99', monitors: 500 },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            <Zap className="h-3 w-3" />
            {t('foundingBadge')} — 剩余 {foundingCount} 个名额
          </div>
          <h1 className="text-4xl font-bold">{t('pricingTitle')}</h1>
          <p className="mt-3 text-zinc-400">{t('pricingSubtitle')}</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div key={p.name} className={`card relative ${p.popular ? 'border-blue-500/50 ring-1 ring-blue-500/30' : ''}`}>
              {p.popular && <span className="absolute -top-3 left-4 rounded-full bg-blue-600 px-2 py-0.5 text-xs">Popular</span>}
              <h3 className="font-semibold">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono">{p.price}</span>
                <span className="text-zinc-500">{t('perMonth')}</span>
              </div>
              {p.founding && <p className="mt-1 text-xs text-zinc-500 line-through">{t('wasPrice', { price: p.founding })}</p>}
              <p className="mt-4 text-sm text-zinc-400">{t('monitors', { count: p.monitors })}</p>
              <Link href="/register" className="btn-primary mt-6 block w-full text-center">{t('getStarted')}</Link>
            </div>
          ))}
        </div>

        <div id="compare" className="mt-20 text-center">
          <h2 className="text-2xl font-bold">与竞品对比</h2>
          <p className="mt-2 text-zinc-400">看看 PulseWatch 如何补齐 UptimeRobot / Better Stack 差距</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href="/compare/uptimerobot" className="btn-secondary">vs UptimeRobot</Link>
            <Link href="/compare/better-stack" className="btn-secondary">vs Better Stack</Link>
          </div>
        </div>

        <div className="mt-20">
          <div className="mx-auto mt-8 max-w-2xl space-y-4">
            {FAQ.map((f) => (
              <details key={f.q} className="card group">
                <summary className="cursor-pointer font-medium group-open:text-blue-400">{f.q}</summary>
                <p className="mt-2 text-sm text-zinc-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" />
        © {new Date().getFullYear()} PulseWatch
      </footer>
    </div>
  );
}
