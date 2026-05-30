'use client';

import { useParams } from 'next/navigation';
import { PublicStatusPageView } from '@/components/public-status-page';

export default function PublicStatusDomainPage() {
  const { domain } = useParams<{ domain: string }>();
  return <PublicStatusPageView lookup="domain" value={decodeURIComponent(domain)} />;
}
