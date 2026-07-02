# Security Policy

## Supported versions

Security fixes are applied on the `main` branch of [securityWatch/web_monitor](https://github.com/securityWatch/web_monitor).

## Reporting a vulnerability

Please **do not** open public issues for undisclosed security problems. Contact the maintainers privately with:

- Description and impact
- Steps to reproduce
- Suggested fix (if any)

## Secrets and self-hosting

This repository is a **desensitized** open-source mirror. It must not contain:

| Never commit | Use instead |
|--------------|-------------|
| `.env`, `环境信息` | `.env.example` + local `.env` |
| SSH / DB passwords | `DEPLOY_PASSWORD`, `PG_PASSWORD` env vars |
| JWT / probe secrets | Generate with `openssl rand -hex 32` |
| DingTalk / Slack / Stripe keys | Server `.env` only |
| WeChat AppSecret | `WECHAT_MINI_APP_SECRET` in API `.env` |
| Production IP or domain | `YOUR_SERVER_IP`, `example.pulsewatch.io` placeholders |

### Verify before you push (maintainers)

```bash
node scripts/oss-verify-secrets.js
```

### Verify after clone (operators)

```bash
node scripts/oss-verify-secrets.js .
```

## Secure deployment defaults

1. Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (not `change-me-in-production`).
2. Bind PostgreSQL to `127.0.0.1` only.
3. Terminate TLS at Nginx or a reverse proxy (`deploy/setup-https.js`).
4. Restrict `CORS_ORIGINS` to your real front-end origins.
5. Store webhook URLs only in `/opt/pulsewatch/api/.env` on the server.

## Dependency updates

Run `npm audit` in `apps/web` and keep Go modules updated (`go get -u ./...` in `apps/api`) as part of regular maintenance.
