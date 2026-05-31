/** Hostnames that serve the PulseWatch app (landing, login), not domain-based status pages. */
export function parseAppDomains(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_APP_DOMAINS ||
    process.env.APP_DOMAINS ||
    'gkao.com.cn,www.gkao.com.cn';
  const hosts = raw
    .split(',')
    .map((d) =>
      d
        .trim()
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .toLowerCase(),
    )
    .filter(Boolean);
  const site = safeHost(process.env.NEXT_PUBLIC_SITE_URL);
  if (site) hosts.push(site);
  return [...new Set(hosts)];
}

export function isAppHost(host: string): boolean {
  const h = host.split(':')[0].toLowerCase();
  return parseAppDomains().includes(h);
}

export function safeHost(raw?: string): string {
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
  }
}
