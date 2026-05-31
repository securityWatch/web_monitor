import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MarketingNav } from '@/components/marketing-nav';
import { BlogArticleJsonLd } from '@/components/blog-article-json-ld';
import { Link } from '@/i18n/navigation';
import { BookOpen } from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo';
import { BLOG_POSTS, getBlogPost, isBlogPostSlug } from '@/lib/blog-posts';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return BLOG_POSTS.flatMap((post) =>
    ['en', 'zh'].map((locale) => ({ locale, slug: post.slug })),
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  const t = await getTranslations({ locale, namespace: 'blog' });
  const article = t.raw(`articles.${post.messageKey}`) as { title: string; excerpt: string };
  return buildPageMetadata({
    locale,
    path: `/blog/${slug}`,
    title: `${article.title} | PulseWatch`,
    description: article.excerpt,
  });
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { locale, slug } = await params;
  const post = getBlogPost(slug);
  if (!post || !isBlogPostSlug(slug)) notFound();

  const t = await getTranslations('blog');
  const article = t.raw(`articles.${post.messageKey}`) as {
    title: string;
    excerpt: string;
    date: string;
    p1: string;
    p2: string;
    p3: string;
    p4: string;
  };

  const paragraphs = [article.p1, article.p2, article.p3, article.p4];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <BlogArticleJsonLd
        locale={locale}
        slug={slug}
        title={article.title}
        description={article.excerpt}
        datePublished={article.date}
      />
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Link href="/blog" className="text-sm text-blue-400 hover:underline">
          ← {t('backToBlog')}
        </Link>
        <time className="mt-6 block text-xs text-zinc-500" dateTime={article.date}>
          {article.date}
        </time>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-4 text-lg text-zinc-400">{article.excerpt}</p>

        <article className="prose prose-invert mt-10 max-w-none space-y-6 text-zinc-300">
          {paragraphs.map((p) => (
            <p key={p.slice(0, 32)} className="leading-relaxed">
              {p}
            </p>
          ))}
        </article>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link href="/register" className="btn-primary">
            {t('ctaPrimary')}
          </Link>
          <Link href="/blog" className="btn-secondary">
            {t('backToBlog')}
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
