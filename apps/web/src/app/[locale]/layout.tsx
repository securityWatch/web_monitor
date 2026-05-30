import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Geist, Geist_Mono } from 'next/font/google';
import { routing } from '@/i18n/routing';
import '../globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const keywords = t('keywords')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    title: { default: t('title'), template: `%s | ${t('title')}` },
    description: t('description'),
    keywords,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'zh')) notFound();
  const messages = await getMessages();

  const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';

  // Baidu Webmaster (百度站长): after verification, add to generateMetadata:
  // verification: { other: { 'baidu-site-verification': 'YOUR_TOKEN' } }

  return (
    <html lang={htmlLang} className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
