'use client';

import { useParams } from 'next/navigation';
import { PublicStatusPageView } from '@/components/public-status-page';

export default function PublicStatusPage() {
  const { slug } = useParams<{ slug: string }>();
  return <PublicStatusPageView lookup="slug" value={slug} />;
}
