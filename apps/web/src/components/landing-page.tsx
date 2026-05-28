'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing-nav';
import { Link } from '@/i18n/navigation';
import { Activity, Bell, Globe, LineChart, Shield, Zap, Code, Sparkles } from 'lucide-react';

export function LandingPageClient({ foundingCount }: { foundingCount: number }) {
  const t = useTranslations('landing');
  const tc = useTranslations('common');

  const features = [
    { icon: Globe, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: LineChart, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: Bell, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: Shield, title: t('feature4Title'), desc: t('feature4Desc') },
    { icon: Code, title: t('feature5Title'), desc: t('feature5Desc') },
    { icon: Sparkles, title: t('feature6Title'), desc: t('feature6Desc') },
  ];

  const plans = [
    { name: t('planFree'), price: '$0', founding: null, monitors: 15 },
    { name: t('planPro'), price: '$1', founding: '$12', monitors: 50, popular: true },
    { name: t('planTeam'), price: '$4', founding: '$39', monitors: 150 },
    { name: t('planBusiness'), price: '$10', founding: '$99', monitors: 500 },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
              <Zap className="h-3 w-3" />
              {t('foundingBadge')} — {t('foundingTitle')}
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">{t('heroTitle')}</h1>
            <p className="mt-6 text-lg text-zinc-400">{t('heroSubtitle')}</p>
            <p className="mt-2 text-sm text-amber-400/80">{t('foundingSubtitle', { count: foundingCount })}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/register" className="btn-primary px-6 py-3 text-base">{t('ctaPrimary')}</Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">{t('ctaSecondary')}</Link>
            </div>
          </div>
          <div className="card border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              api.example.com — {tc('up')}
            </div>
            <div className="font-mono text-4xl font-bold tabular-nums">99.98%</div>
            <div className="mt-1 text-sm text-zinc-500">24h uptime</div>
            <div className="mt-6 h-24 rounded-lg bg-gradient-to-r from-blue-600/20 via-blue-500/10 to-transparent" />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-zinc-800 bg-zinc-950/50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold">{t('featuresTitle')}</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card hover:border-zinc-700 transition-colors">
                <f.icon className="h-8 w-8 text-blue-500" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold">{t('pricingTitle')}</h2>
          <p className="mt-2 text-center text-zinc-400">{t('pricingSubtitle')}</p>
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
        </div>
      </section>

      <section className="border-t border-zinc-800 py-16 text-center">
        <h2 className="text-2xl font-bold">{t('finalCta')}</h2>
        <Link href="/register" className="btn-primary mt-6 inline-block px-8 py-3">{t('ctaPrimary')}</Link>
      </section>

      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" />
        © {new Date().getFullYear()} PulseWatch
      </footer>
    </div>
  );
}
