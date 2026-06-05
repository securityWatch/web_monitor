# PulseWatch

**English** | [中文文档](./README.zh-CN.md)

[![PulseWatch](https://gkao.com.cn/api/v1/public/badge/your_token.svg)](https://gkao.com.cn)

**PulseWatch** is an open-core website monitoring SaaS platform with a commercial-friendly free tier. Monitor websites, APIs, SSL certificates, DNS records, and more — with alerts via email, webhook, Slack, DingTalk, Feishu, and WeCom.

> **Live demo**: [https://gkao.com.cn](https://gkao.com.cn)

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Monitor types** | HTTP/HTTPS, TCP, Ping, Keyword, SSL expiry, DNS, Heartbeat, Domain (RDAP), PageSpeed, Tamper (content integrity), API/JSON |
| **Alert channels** | Email, Webhook, Slack, Discord, Microsoft Teams, DingTalk, Feishu, WeCom, PagerDuty, Opsgenie, SMS, Voice |
| **Incident management** | Timeline, notes, workflow states, on-call rotation, voice escalation, AI post-mortem summaries |
| **Status pages** | Public branded status pages, custom domains, email subscribers, announcements |
| **Security monitors** | SSL expiry tiers (30/14/7/1 day), DNS hijack/drift detection, page tamper detection with AI content recognition |
| **Dashboard** | Real-time KPI cards, response time trends (24h), recent failures ticker, per-monitor stats |
| **Dev tools** | Free online tools: SSL checker, DNS lookup, ping test, port checker, HTTP headers inspector, redirect chain checker, downtime cost calculator, uptime badge generator |
| **i18n** | English and 中文 |
| **Team** | Role-based access (owner/admin/member/viewer), team invitations |
| **Billing** | Free tier (10 monitors), Founding Member pricing ($1/mo Pro, $4/mo Team, $10/mo Business) |
| **WeChat Mini Program** | Native mobile app with dashboard, monitors, incidents, status pages, alert channels, and one-click WeChat login |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router), Tailwind 4, next-intl, Recharts |
| **Backend** | Go 1.25, Gin router, pgx, JWT auth |
| **Database** | PostgreSQL 16 (partitioned `check_results`, no ClickHouse) |
| **Deployment** | Systemd on Ubuntu, Nginx reverse proxy, Let's Encrypt / Cloudflare SSL |
| **Mini Program** | WeChat native mini program (11 pages, 5-tab navigation) |

## Architecture

```
┌──────────┐    ┌──────────┐    ┌──────────────┐
│  Browser │───▶│  Nginx   │───▶│  Next.js 15  │
│  Mobile  │    │  :80/443 │    │  :3000       │
└──────────┘    │  /api/*  │    └──────────────┘
                │  proxy   │    ┌──────────────┐
                │──────────│───▶│  Go API      │
                │  /health │    │  :4000       │
                └──────────┘    └──────┬───────┘
                                       │
                                ┌──────▼───────┐
                                │  PostgreSQL  │
                                │  :6541       │
                                └──────────────┘
```

## Getting Started

### Prerequisites

- Go 1.25+ (set `GOTOOLCHAIN=auto`)
- Node.js 22+
- PostgreSQL 16
- Redis (not required — all state managed in PostgreSQL)

### Quick Start

```bash
# Clone
git clone https://github.com/mafei2021/monitor.git
cd monitor

# Setup environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Start API
export GOTOOLCHAIN=auto
cd apps/api && go run ./cmd/server

# In another terminal, start web
cd apps/web && npm install && npm run dev
```

The API runs on `:4000`, web on `:3000`. See `.env.example` for all config options.

### Test

```bash
# Unit tests
npm run test:unit

# Integration tests (requires PostgreSQL)
npm run test:integration
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) and [README.zh-CN.md](./README.zh-CN.md) for details.

Set `DEPLOY_PASSWORD` (and `PG_PASSWORD` for first install) in the shell or local `环境信息` (never commit).

| Scenario | Command |
|----------|---------|
| **Routine release (API + Web)** | `npm run deploy` |
| **First-time install** | `npm run deploy:first` |
| **API only** | `npm run deploy:api` |
| **Web only** | `npm run deploy:web` |
| **Deploy + sync OSS mirror** | `npm run deploy -- --sync-oss` |

```bash
export DEPLOY_HOST=49.234.112.108
export DEPLOY_PASSWORD=<password>
export PG_PASSWORD=<postgres-password>   # first install only
npm run deploy
```

## Project Structure

```
apps/
├── api/                # Go backend (Gin + pgx)
│   ├── cmd/server/     # API server entry
│   ├── internal/
│   │   ├── config/     # Configuration
│   │   ├── database/   # Migrations + DB connection
│   │   ├── handlers/   # HTTP handlers
│   │   ├── middleware/  # Auth, rate limiting
│   │   ├── models/     # Data models
│   │   └── services/   # Business logic
│   └── go.mod
├── web/                # Next.js 15 frontend
│   ├── messages/       # i18n (en, zh)
│   └── src/
│       ├── app/        # App Router pages
│       ├── components/ # React components
│       └── lib/        # Utilities, SEO, API
└── miniprogram/        # WeChat Mini Program
    ├── pages/          # 11 pages
    └── utils/          # API client, auth, format

deploy/                 # Deployment scripts (Node.js)
docs/                   # Documentation
scripts/                # Utility scripts
tests/                  # E2E tests
```

## Open source mirror

The public, desensitized tree is published at **[securityWatch/web_monitor](https://github.com/securityWatch/web_monitor)**.

After pushing to private `main`, sync the desensitized mirror automatically:

```bash
npm run publish:main    # git push origin main + sync web_monitor
npm run sync:oss        # sync only
SKIP_OSS_SYNC=1 npm run publish:main   # push without OSS
```

See `.cursor/rules/web-monitor-oss.mdc`.

## Contributing

Contributions are welcome. Please ensure:
- No secrets, `.env`, or credentials are committed (`.gitignore` handles this)
- UI changes include i18n keys in both `en.json` and `zh.json`
- API changes include tests
- All deploy scripts read passwords from `process.env.DEPLOY_PASSWORD`

## License

See [LICENSE](./LICENSE) file.
