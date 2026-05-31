import { getTranslations } from 'next-intl/server';
import { MarketingNav } from '@/components/marketing-nav';
import { Link } from '@/i18n/navigation';
import { Globe, CreditCard, ShieldCheck, Megaphone } from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.useCases.ecommerce' });
  return buildPageMetadata({
    locale,
    path: '/use-cases/ecommerce-uptime',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default async function EcommerceUptimeUseCasePage() {
  const t = await getTranslations('useCases.ecommerce');

  const highlights = [
    { icon: Globe, title: t('h1Title'), desc: t('h1Desc') },
    { icon: CreditCard, title: t('h2Title'), desc: t('h2Desc') },
    { icon: ShieldCheck, title: t('h3Title'), desc: t('h3Desc') },
    { icon: Megaphone, title: t('h4Title'), desc: t('h4Desc') },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <p className="text-sm text-blue-400">{t('eyebrow')}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-4 text-lg text-zinc-400">{t('subtitle')}</p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {highlights.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card">
              <Icon className="h-6 w-6 text-blue-400" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
          <h2 className="text-2xl font-bold">{t('freeTierTitle')}</h2>
          <p className="mt-3 text-zinc-400">{t('freeTierDesc')}</p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-300">
            <li>• {t('freeTier1')}</li>
            <li>• {t('freeTier2')}</li>
            <li>• {t('freeTier3')}</li>
          </ul>
        </section>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link href="/register" className="btn-primary">{t('ctaPrimary')}</Link>
          <Link href="/tools/ssl-checker" className="btn-secondary">{t('ctaTool')}</Link>
          <Link href="/features/ssl-monitoring" className="btn-secondary">{t('ctaFeature')}</Link>
        </div>
      </main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <Globe className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        © {new Date().getFullYear()} PulseWatch
      </footer>
    </div>
  );
}
