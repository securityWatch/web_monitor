import { LandingPageClient } from '@/components/landing-page';

async function getFoundingCount() {
  try {
    const base = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${base}/api/v1/public/founding-count`, {
      next: { revalidate: 60 },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data.remaining as number;
    }
  } catch { /* ignore */ }
  return 3847;
}

export default async function LandingPage() {
  const foundingCount = await getFoundingCount();
  return <LandingPageClient foundingCount={foundingCount} />;
}
