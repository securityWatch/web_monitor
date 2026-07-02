/** Comma-separated hostnames allowed for app routes (set at build via NEXT_PUBLIC_APP_DOMAINS). */
export const defaultAppDomains =
  process.env.NEXT_PUBLIC_APP_DOMAINS ||
  'localhost:3000,127.0.0.1:3000,example.pulsewatch.io,www.example.pulsewatch.io';
