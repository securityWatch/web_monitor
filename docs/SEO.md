# PulseWatch SEO Guide

This document describes on-page and technical SEO implemented for the marketing site, what operators must do manually, and ongoing maintenance.

## Production note

The live site is at **`https://gkao.com.cn`** (canonical; also reachable via legacy IP). Set canonical URL when binding a custom domain:

- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin (no trailing slash).
- Follow **[DOMAIN-HTTPS.md](DOMAIN-HTTPS.md)** (`apply-domain.js` → `setup-https.js`).
- Re-submit `sitemap.xml` in Google Search Console and 百度站长.
- In China, **ICP 备案** is often required for stable Baidu indexing on a custom domain.

Optional verification env vars (server env, never commit values):

| Variable | Purpose |
|----------|---------|
| `BAIDU_SITE_VERIFICATION` | 百度站长 meta tag |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console HTML tag |

These are read at **Next.js build time** by `[locale]/layout.tsx`. Remote deploy (`redeploy-web.js`) loads them from `/opt/pulsewatch/build/.env` first, then `/opt/pulsewatch/api/.env`.

### Patch verification tokens on server (no secrets in Git)

```bash
# From repo root — set only the vars you have from Search Console / 百度站长
GOOGLE_SITE_VERIFICATION=your-google-token \
BAIDU_SITE_VERIFICATION=your-baidu-token \
node deploy/patch-seo-verification.js

# Rebuild web so meta tags are baked into HTML
NEXT_PUBLIC_SITE_URL=https://gkao.com.cn node deploy/redeploy-web.js
```

`deploy/patch-seo-verification.js` writes to `/opt/pulsewatch/build/.env` via SSH (same pattern as `patch-dingtalk.js`).

## What we implemented

### Technical SEO (Next.js App Router)

| Item | Location | Purpose |
|------|----------|---------|
| Per-route metadata | `buildPageMetadata` in `apps/web/src/lib/seo.ts` | Title, description, canonical, hreflang |
| `metadataBase` | `apps/web/src/app/layout.tsx` | Correct absolute OG/Twitter image URLs |
| Open Graph + Twitter | `buildPageMetadata` + `opengraph-image.tsx` | Social previews |
| `robots.txt` | `apps/web/src/app/robots.ts` | Allow marketing; disallow authenticated app routes |
| `sitemap.xml` | `apps/web/src/app/sitemap.ts` | All `publicMarketingPaths` × en/zh |
| JSON-LD | `landing-json-ld.tsx`, `blog-article-json-ld.tsx`, pricing FAQ | Organization, FAQ, Article |
| App routes noindex | `(app)/layout.tsx` | Dashboard/monitors not indexed |

### Public marketing surface (sitemap)

- Home, login, register, pricing, compare pages
- Feature pages: uptime, SSL, status pages, alerting
- Use cases: API monitoring, e-commerce uptime
- Blog index + articles (`/blog/how-to-monitor-api-uptime`, `/blog/website-down-checker-guide`, `/blog/ssl-certificate-monitoring-guide`, `/blog/downtime-cost-calculator-guide`)
- Free tools: website down checker, SSL, DNS, ping, port, **HTTP headers**, **downtime cost calculator**, plus dev tools (JSON, PDF, etc.)

### Free SEO tools (public API)

| Tool | API |
|------|-----|
| Website down checker | `GET /api/v1/public/http-check?url=` |
| SSL checker | `GET /api/v1/public/ssl-check?host=` |
| DNS lookup | `GET /api/v1/public/dns-lookup?host=&type=` |
| Ping test | `GET /api/v1/public/ping?host=` |
| Port checker | `GET /api/v1/public/port-check?host=&port=` |
| HTTP headers | `GET /api/v1/public/http-headers?url=` |

## Operator checklist

### Google Search Console

1. Add property for canonical origin.
2. Set `GOOGLE_SITE_VERIFICATION` via `patch-seo-verification.js`, then `redeploy-web.js`.
   Or: `cd deploy && node patch-seo-verification.js` then `node redeploy-web.js`.
3. Submit `{SITE_URL}/sitemap.xml`.
4. Inspect `/en` and `/zh` — indexable, canonical correct.

### 百度站长平台

1. Register at https://ziyuan.baidu.com/
2. Set `BAIDU_SITE_VERIFICATION`, redeploy web (`patch-seo-verification.js` + `redeploy-web.js`).
3. Submit sitemap; use 抓取诊断 on `/zh`.

## Ongoing maintenance

- [ ] Add new public routes to `publicMarketingPaths` in `seo.ts`.
- [ ] Keep visible homepage FAQ count in sync with `landing-json-ld.tsx` (`FAQ_COUNT`).
- [ ] Update landing copy when shipping user-facing features.
- [ ] After HTTPS migration: update Search Console + 百度, re-submit sitemap.

## Files reference

- SEO helpers: `apps/web/src/lib/seo.ts`
- Copy: `apps/web/messages/en.json`, `zh.json`
- HTTPS template: `deploy/nginx/pulsewatch-https.conf.example`
- SEO verification patch: `deploy/patch-seo-verification.js`
