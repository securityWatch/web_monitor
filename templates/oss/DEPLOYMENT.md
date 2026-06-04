# PulseWatch — Self-Hosted Deployment

> **Never commit** `.env`, SSH passwords, API keys, or webhook URLs to Git. Use `.env.example` as a template only.

## Overview

| Component | Technology | Default port |
|-----------|------------|--------------|
| Web UI | Next.js 15 (standalone) | 3000 (internal) |
| API + scheduler | Go 1.25 (Gin + pgx) | 4000 (internal) |
| Reverse proxy | Nginx | **80** / **443** (public) |
| Database | PostgreSQL 16 | 5432 or **6541** (your install) |

Public traffic should hit **Nginx on 80/443** only. Ports 3000 and 4000 are upstream services on localhost.

## Prerequisites

- Ubuntu 22.04+ (or similar Linux)
- PostgreSQL 16 with database `pulsewatch`
- Node.js 22+, Go 1.25+ (`GOTOOLCHAIN=auto` on build machines)
- Nginx, systemd

## 1. Local development

```bash
git clone https://github.com/securityWatch/web_monitor.git
cd web_monitor

cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

export GOTOOLCHAIN=auto
cd apps/api && go run ./cmd/server          # :4000
cd apps/web && npm install && npm run dev     # :3000 → /en /zh
```

Health check: `curl -s http://127.0.0.1:4000/health` → `{"status":"ok"}`

## 2. First production deploy (automated)

From your **local machine** with SSH access to the server:

```bash
export DEPLOY_HOST=YOUR_SERVER_IP          # or DNS name
export DEPLOY_USER=ubuntu
export DEPLOY_PASSWORD=your-ssh-password   # required
export PG_PASSWORD=your-postgres-password    # required for deploy.js
export APP_DOMAINS=example.pulsewatch.io,www.example.pulsewatch.io
export NEXT_PUBLIC_SITE_URL=https://example.pulsewatch.io

cd deploy && node deploy.js
```

This will:

1. Cross-compile the Go API for `linux/amd64`
2. Install Nginx (if missing), create `/opt/pulsewatch`
3. Write `/opt/pulsewatch/api/.env` with generated JWT secrets
4. Upload API binary and Next.js standalone bundle
5. Install systemd units `pulsewatch-api` and `pulsewatch-web`
6. Apply Nginx site config from `deploy/nginx/pulsewatch.conf`

### Verify

```bash
curl -s http://YOUR_SERVER_IP/health
curl -s -o /dev/null -w '%{http_code}\n' http://YOUR_SERVER_IP/en
```

## 3. Incremental redeploy

| Change | Command |
|--------|---------|
| API only | `cd deploy && node redeploy-api.js` |
| Web only | `cd deploy && NEXT_PUBLIC_SITE_URL=https://your.domain node redeploy-web.js` |
| Nginx | `cd deploy && node apply-nginx.js` |
| Custom domain + CORS | `APP_DOMAINS=your.domain node apply-domain.js` |
| HTTPS (Let's Encrypt) | `APP_DOMAINS=your.domain node setup-https.js` |

All deploy scripts require `DEPLOY_PASSWORD`. API-first deploy also needs `PG_PASSWORD` or `DATABASE_URL` on **first** `deploy.js` run.

## 4. Environment variables

Production files:

- `/opt/pulsewatch/api/.env` — API, DB, JWT, SMTP, WeChat, Stripe, probes
- `/opt/pulsewatch/web/.env` — `NEXT_PUBLIC_*` for browser and SEO

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Auth tokens — use long random values |
| `CORS_ORIGINS` | Comma-separated browser origins |
| `NEXT_PUBLIC_API_URL` | Public API base (no `:4000` when behind Nginx) |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for sitemap / Open Graph |
| `SMTP_*` | Email alerts (`SMTP_MODE=console` logs only) |
| `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET` | Mini program login (optional) |
| `DINGTALK_WEBHOOK_URL` | Ops notifications (optional, set on server only) |
| `PROBE_DISPATCH` / `PROBE_SECRET` | Multi-region probe workers (optional) |

See `.env.example` for the full list.

## 5. systemd services

```bash
sudo systemctl status pulsewatch-api pulsewatch-web nginx
sudo systemctl restart pulsewatch-api pulsewatch-web
sudo journalctl -u pulsewatch-api -f
```

Next.js standalone working directory:

```text
/opt/pulsewatch/web/.next/standalone/apps/web
```

If static assets are missing after deploy:

```bash
cp -r /opt/pulsewatch/web/.next/static /opt/pulsewatch/web/.next/standalone/apps/web/.next/
cp -r /opt/pulsewatch/web/public /opt/pulsewatch/web/.next/standalone/apps/web/
```

## 6. WeChat mini program (optional)

1. Register a mini program in [WeChat Open Platform](https://mp.weixin.qq.com/)
2. Set `WECHAT_MINI_APP_ID` and `WECHAT_MINI_APP_SECRET` in API `.env`
3. Edit `apps/miniprogram/config/env.js` → your HTTPS API origin
4. In WeChat Admin → **开发** → **服务器域名**, allow your API domain
5. Upload with WeChat DevTools (`apps/miniprogram/project.config.json` → your AppID)

## 7. Security checklist

- [ ] Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` from `.env.example` defaults
- [ ] Restrict PostgreSQL to localhost
- [ ] Use HTTPS in production (`setup-https.js` or Cloudflare)
- [ ] Never commit `DEPLOY_PASSWORD`, `PG_PASSWORD`, or webhook URLs
- [ ] Review `scripts/oss-verify-secrets.js` patterns before publishing forks

## 8. Tests

```bash
npm run test:unit
# Integration (local Postgres):
npm run test:integration
# E2E (API + web running):
API_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash tests/e2e-test.sh
```

## Architecture

- **Go** — `apps/api/` (monitors, checks, incidents, alerts, auth)
- **Next.js** — `apps/web/` (dashboard, monitors, settings, marketing, public tools)
- **PostgreSQL** — partitioned `check_results` (no ClickHouse)

For feature gaps and roadmap see `docs/GAP-BACKLOG.md` and `docs/IMPLEMENTATION-ROADMAP.md`.
