# PulseWatch SEO Guide

This document describes on-page and technical SEO implemented for the marketing homepage (`/en`, `/zh`), what operators must do manually, and ongoing maintenance.

## Production note

The live site is currently served over **HTTP** at `http://49.234.112.108` (no HTTPS yet). Search engines still index HTTP URLs, but:

- Google and Baidu both prefer HTTPS for ranking signals and user trust.
- In China, **ICP 备案** is often required for stable Baidu indexing on a custom domain; the IP-only URL is fine for early testing but submit your final domain after备案.
- Set `NEXT_PUBLIC_SITE_URL` in production `.env` to the canonical origin (no trailing slash) so sitemap, canonical, and Open Graph URLs stay correct when you add a domain or HTTPS.

## What we implemented

### Technical SEO (Next.js App Router)

| Item | Location | Purpose |
|------|----------|---------|
| Per-locale title, description, keywords | `apps/web/src/app/[locale]/page.tsx` (`meta.home`) | Homepage-specific metadata |
| Open Graph + Twitter cards | `apps/web/src/lib/seo.ts` → `buildPageMetadata` | Social previews |
| Canonical + hreflang (`en`, `zh`, `x-default`) | `buildPageMetadata` | Avoid duplicate-language issues; help Google/Baidu pair locales |
| `robots.txt` | `apps/web/src/app/robots.ts` | Allow crawlers; point to sitemap |
| `sitemap.xml` | `apps/web/src/app/sitemap.ts` | Home, login, register, pricing, compare pages, SSL tool (× en/zh) |
| JSON-LD | `apps/web/src/components/landing-json-ld.tsx` | `Organization`, `WebSite`, `WebPage`, `FAQPage` (10 Q&A) |
| `lang` on `<html>` | `apps/web/src/app/[locale]/layout.tsx` | `en` or `zh-CN` for Baidu/Google language hints |
| Server-rendered landing copy | `apps/web/src/components/landing-page.tsx` | Indexable H1/H2, FAQ `<details>`, internal links |

### On-page content

After the hero (CTA preserved), the homepage includes:

- **What is PulseWatch** — multi-paragraph explainer (uptime monitoring, checks, alerts)
- **Use cases** — API, e-commerce, SaaS, 国内/出海团队
- **Feature grid** — keyword-rich subtitles (existing + SEO subtitle)
- **Trust / downtime cost** — factual framing, link to comparison page (not fake reviews)
- **FAQ** — 10 questions (visible + JSON-LD aligned)
- **Resources** — links to `/login`, `/register`, SSL tool, compare pages

Dev tools (`#tools`) remain in the DOM for crawlers (client-rendered but present in HTML after hydration; primary SEO text is server-rendered).

### Baidu-specific

- Substantial **unique zh-CN** strings in `messages/zh.json` (not English placeholders).
- `zh-CN` `lang` attribute on Chinese pages.
- Placeholder comment in `[locale]/layout.tsx` for `baidu-site-verification` meta when you obtain a token from [百度站长平台](https://ziyuan.baidu.com/).

### Google-specific

- FAQ structured data for eligible rich results (not guaranteed).
- hreflang alternates for `/en` ↔ `/zh`.
- Submit `https://YOUR_ORIGIN/sitemap.xml` in [Google Search Console](https://search.google.com/search-console).

## Google vs Baidu — operator checklist

### Google Search Console

1. Add property for your canonical origin (domain or `http://49.234.112.108` temporarily).
2. Verify via DNS TXT or HTML file/meta.
3. Submit sitemap: `{SITE_URL}/sitemap.xml`.
4. Inspect URL: `/en` and `/zh` — confirm “Page is indexable”, canonical matches.
5. Monitor Coverage / Core Web Vitals after HTTPS migration (update `NEXT_PUBLIC_SITE_URL`).

### 百度站长平台

1. Register site at https://ziyuan.baidu.com/
2. Verify ownership (meta tag recommended — add token to `generateMetadata` in `[locale]/layout.tsx` as documented in code comment).
3. Submit sitemap same path: `/sitemap.xml` (includes Chinese URLs).
4. Use “抓取诊断” on `/zh` to confirm `lang=zh-CN` and Chinese body text.
5. Plan for **HTTPS + 备案** on production domain for long-term Baidu trust.

### Both

- Keep `NEXT_PUBLIC_SITE_URL` accurate after domain/HTTPS changes.
- Avoid blocking `/zh` in `robots.txt`.
- Do not hide critical marketing copy behind login-only client routes; app pages (`/monitors`) correctly require auth and are omitted from sitemap.

## Ongoing maintenance

- [ ] Update `meta.home` / FAQ when major features ship (keep JSON-LD in sync with visible FAQ).
- [ ] Add new **public** marketing routes to `publicMarketingPaths` in `apps/web/src/lib/seo.ts`.
- [ ] Refresh sitemap `lastModified` strategy if you add a CMS or blog.
- [ ] After HTTPS: redirect HTTP→HTTPS, update Search Console + 百度 properties, re-submit sitemap.
- [ ] Add real `og:image` asset when brand creative is ready (optional enhancement).
- [ ] Monitor Search Console / 百度 for crawl errors after each deploy (`cd deploy && node redeploy-web.js`).

## Files reference

- SEO helpers: `apps/web/src/lib/seo.ts`
- Homepage metadata: `apps/web/src/app/[locale]/page.tsx`
- Copy: `apps/web/messages/en.json`, `apps/web/messages/zh.json` (`landing`, `meta.home`)
- Docs: this file
