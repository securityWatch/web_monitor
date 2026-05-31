import { getTranslations } from 'next-intl/server';
import { MarketingNav } from '@/components/marketing-nav';
import { Link } from '@/i18n/navigation';
import { BookOpen } from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo';
import { BLOG_POSTS } from '@/lib/blog-posts';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.blog' });
  return buildPageMetadata({
    locale,
    path: '/blog',
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
  });
}

export default async function BlogIndexPage() {
  const t = await getTranslations('blog');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-sm text-blue-400">{t('eyebrow')}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-4 text-lg text-zinc-400">{t('subtitle')}</p>

        <ul className="mt-12 space-y-6">
          {BLOG_POSTS.map((post) => {
            const article = t.raw(`articles.${post.messageKey}`) as {
              title: string;
              excerpt: string;
              date: string;
            };
            return (
              <li key={post.slug} className="card">
                <time className="text-xs text-zinc-500" dateTime={article.date}>
                  {article.date}
                </time>
                <h2 className="mt-2 text-xl font-semibold">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="text-white hover:text-blue-300"
                  >
                    {article.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-zinc-400">{article.excerpt}</p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-4 inline-block text-sm text-blue-400 hover:underline"
                >
                  {t('readArticle')} →
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-12">
          <Link href="/register" className="btn-primary">
            {t('ctaPrimary')}
          </Link>
        </div>
      </main>
      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <BookOpen className="mx-auto mb-2 h-5 w-5 text-blue-500" aria-hidden />
        © {new Date().getFullYear()} PulseWatch
      </footer>
    </div>
  );
}
