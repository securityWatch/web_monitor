import { getTranslations } from 'next-intl/server';
import { MarketingNav } from '@/components/marketing-nav';
import { Wrench } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  Activity,
  Bell,
  Globe,
  LineChart,
  Shield,
  Zap,
  Code,
  Sparkles,
  Server,
  ShoppingCart,
  Cloud,
  Users,
  Lock,
  Phone,
  MapPin,
  LayoutDashboard,
  Search,
  CalendarClock,
  AlertTriangle,
  Radio,
} from 'lucide-react';

const FAQ_COUNT = 13;

export async function LandingPage({ foundingCount }: { foundingCount: number }) {
  const t = await getTranslations('landing');
  const tc = await getTranslations('common');

  const features = [
    { icon: Globe, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: Lock, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: LineChart, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: Bell, title: t('feature4Title'), desc: t('feature4Desc') },
    { icon: Phone, title: t('feature5Title'), desc: t('feature5Desc') },
    { icon: MapPin, title: t('feature6Title'), desc: t('feature6Desc') },
    { icon: Code, title: t('feature7Title'), desc: t('feature7Desc') },
    { icon: LayoutDashboard, title: t('feature8Title'), desc: t('feature8Desc') },
    { icon: Sparkles, title: t('feature9Title'), desc: t('feature9Desc') },
  ];

  const useCases = [
    { icon: Server, title: t('useCase1Title'), desc: t('useCase1Desc') },
    { icon: ShoppingCart, title: t('useCase2Title'), desc: t('useCase2Desc') },
    { icon: Cloud, title: t('useCase3Title'), desc: t('useCase3Desc') },
    { icon: Users, title: t('useCase4Title'), desc: t('useCase4Desc') },
    { icon: Shield, title: t('useCase5Title'), desc: t('useCase5Desc') },
  ];

  const plans = [
    { name: t('planFree'), price: '$0', founding: null, monitors: 10 },
    { name: t('planPro'), price: '$1', founding: '$12', monitors: 50, popular: true },
    { name: t('planTeam'), price: '$4', founding: '$39', monitors: 150 },
    { name: t('planBusiness'), price: '$10', founding: '$99', monitors: 500 },
  ];

  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`faq${i + 1}Q`),
    a: t(`faq${i + 1}A`),
  }));

  const capabilityBlocks = [
    { icon: Globe, title: t('cap1Title'), desc: t('cap1Desc') },
    { icon: Lock, title: t('cap2Title'), desc: t('cap2Desc') },
    { icon: Shield, title: t('cap3Title'), desc: t('cap3Desc') },
    { icon: AlertTriangle, title: t('cap4Title'), desc: t('cap4Desc') },
    { icon: Phone, title: t('cap5Title'), desc: t('cap5Desc') },
    { icon: Bell, title: t('cap6Title'), desc: t('cap6Desc') },
    { icon: CalendarClock, title: t('cap7Title'), desc: t('cap7Desc') },
    { icon: Search, title: t('cap8Title'), desc: t('cap8Desc') },
    { icon: Radio, title: t('cap9Title'), desc: t('cap9Desc') },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32" aria-labelledby="hero-heading">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
              <Zap className="h-3 w-3" aria-hidden />
              {t('foundingBadge')} — {t('foundingTitle')}
            </div>
            <h1 id="hero-heading" className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-6 text-lg text-zinc-400">{t('heroSubtitle')}</p>
            <p className="mt-2 text-sm text-amber-400/80">{t('foundingSubtitle', { count: foundingCount })}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/register" className="btn-primary px-6 py-3 text-base">
                {t('ctaPrimary')}
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">
                {t('ctaSecondary')}
              </Link>
            </div>
          </div>
          <div
            className="card border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8"
            role="img"
            aria-label={t('heroPreviewAria')}
          >
            <div className="mb-4 flex items-center gap-2 text-sm text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              api.example.com — {tc('up')}
            </div>
            <div className="font-mono text-4xl font-bold tabular-nums">99.98%</div>
            <div className="mt-1 text-sm text-zinc-500">24h uptime</div>
            <div className="mt-6 h-24 rounded-lg bg-gradient-to-r from-blue-600/20 via-blue-500/10 to-transparent" />
          </div>
        </div>
      </section>

      <section id="about" className="border-t border-zinc-800 bg-zinc-950/30 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">{t('aboutTitle')}</h2>
          <p className="mt-4 text-lg text-zinc-300 leading-relaxed">{t('aboutLead')}</p>
          <p className="mt-4 text-zinc-400 leading-relaxed">{t('aboutP1')}</p>
          <p className="mt-4 text-zinc-400 leading-relaxed">{t('aboutP2')}</p>
          <p className="mt-4 text-zinc-400 leading-relaxed">{t('aboutP3')}</p>
        </div>
      </section>

      <section id="use-cases" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold">{t('useCasesTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">{t('useCasesSubtitle')}</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {useCases.map((u) => (
              <article key={u.title} className="card hover:border-zinc-700 transition-colors">
                <u.icon className="h-8 w-8 text-blue-500" aria-hidden />
                <h3 className="mt-4 font-semibold text-white">{u.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{u.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-800 bg-zinc-950/50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="card border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <Wrench className="mx-auto h-10 w-10 text-blue-500" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold">{t('toolsCtaTitle')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">{t('toolsCtaDesc')}</p>
            <Link href="/tools" className="btn-primary mt-6 inline-block px-6 py-3">
              {t('toolsCtaButton')}
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-t border-zinc-800 bg-zinc-950/50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold">{t('featuresTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">{t('featuresSubtitle')}</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="card hover:border-zinc-700 transition-colors">
                <f.icon className="h-8 w-8 text-blue-500" aria-hidden />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-t border-zinc-800 py-20" aria-labelledby="capabilities-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="capabilities-heading" className="text-center text-3xl font-bold">
            {t('capabilitiesTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-zinc-400">{t('capabilitiesSubtitle')}</p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {capabilityBlocks.map((block) => (
              <article key={block.title} className="card hover:border-zinc-700 transition-colors">
                <block.icon className="h-7 w-7 text-blue-500" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-white">{block.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{block.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="border-t border-zinc-800 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold">{t('trustTitle')}</h2>
          <p className="mt-4 text-zinc-400 leading-relaxed">{t('trustLead')}</p>
          <ul className="mt-8 space-y-3 text-left text-sm text-zinc-300">
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">{t('trustPoint1')}</li>
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">{t('trustPoint2')}</li>
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">{t('trustPoint3')}</li>
          </ul>
          <p className="mt-6 text-sm text-zinc-500">
            {t('trustCompare')}{' '}
            <Link href="/compare/uptimerobot" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
              {t('trustCompareLink')}
            </Link>
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-t border-zinc-800 bg-zinc-950/30 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center">{t('faqTitle')}</h2>
          <p className="mt-3 text-center text-zinc-400">{t('faqSubtitle')}</p>
          <div className="mt-10 space-y-3">
            {faqItems.map((item, idx) => (
              <details
                key={idx}
                className="group rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 open:border-zinc-700"
              >
                <summary className="cursor-pointer font-medium text-zinc-100 list-none flex justify-between gap-4">
                  {item.q}
                  <span className="text-zinc-500 group-open:rotate-45 transition-transform" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed pb-1">{item.a}</p>
              </details>
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
              <div
                key={p.name}
                className={`card relative ${p.popular ? 'border-blue-500/50 ring-1 ring-blue-500/30' : ''}`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-4 rounded-full bg-blue-600 px-2 py-0.5 text-xs">
                    Popular
                  </span>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold font-mono">{p.price}</span>
                  <span className="text-zinc-500">{t('perMonth')}</span>
                </div>
                {p.founding && (
                  <p className="mt-1 text-xs text-zinc-500 line-through">{t('wasPrice', { price: p.founding })}</p>
                )}
                <p className="mt-4 text-sm text-zinc-400">{t('monitors', { count: p.monitors })}</p>
                <Link href="/register" className="btn-primary mt-6 block w-full text-center">
                  {t('getStarted')}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-500">
            <Link href="/pricing" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
              {t('pricingFullLink')}
            </Link>
          </p>
        </div>
      </section>

      <section id="resources" className="border-t border-zinc-800 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-2xl font-bold">{t('resourcesTitle')}</h2>
          <ul className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            <li>
              <Link href="/login" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesLogin')}
              </Link>
            </li>
            <li>
              <Link href="/register" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesRegister')}
              </Link>
            </li>
            <li>
              <Link href="/tools" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesDevTools')}
              </Link>
            </li>
            <li>
              <Link href="/tools/pdf-to-word" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesPdfToWord')}
              </Link>
            </li>
            <li>
              <Link href="/tools/ssl-checker" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesSsl')}
              </Link>
            </li>
            <li>
              <Link href="/tools/website-down-checker" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesWebsiteDown')}
              </Link>
            </li>
            <li>
              <Link href="/features/uptime-monitoring" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesUptimeFeature')}
              </Link>
            </li>
            <li>
              <Link href="/compare/better-stack" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesCompare')}
              </Link>
            </li>
            <li>
              <Link href="/compare/uptimerobot" className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline">
                {t('resourcesCompareUptimeRobot')}
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-zinc-500">{t('resourcesAppNote')}</p>
          <p className="mt-2 text-xs text-zinc-500">{t('resourcesMiniprogramNote')}</p>
        </div>
      </section>

      <section className="border-t border-zinc-800 py-16 text-center">
        <h2 className="text-2xl font-bold">{t('finalCta')}</h2>
        <Link href="/register" className="btn-primary mt-6 inline-block px-8 py-3">
          {t('ctaPrimary')}
        </Link>
      </section>

      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        <p>© {new Date().getFullYear()} PulseWatch — {tc('tagline')}</p>
      </footer>
    </div>
  );
}
