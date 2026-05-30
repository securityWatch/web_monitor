# PulseWatch — Agent Guide

## Cursor Cloud specific instructions

### Services (local dev)

| Service | Port | Required for E2E |
|---------|------|------------------|
| PostgreSQL 16 | 5432 | Yes |
| Go API | 4000 | Yes |
| Next.js web | 3000 | Yes |
| Redis | 6379 | No (unused in code) |

### First-time startup (per session)

1. Copy env if missing: `cp .env.example .env`
2. Database: `sudo docker compose up -d postgres` (wait for `pg_isready -U pulsewatch`)
3. Dev servers — **do not** run `npm run dev` after sourcing `.env` without fixing ports: `.env` sets `PORT=4000`, which Next.js will inherit and bind on 4000, conflicting with the API.

   Recommended:

   ```bash
   export GOTOOLCHAIN=auto
   set -a && source .env && set +a
   npx concurrently "cd apps/api && go run ./cmd/server" "PORT=3000 npm run dev -w @pulsewatch/web"
   ```

   Or use tmux session `pulsewatch-dev` with the same command.

4. Smoke: `curl -s http://127.0.0.1:4000/health` → `"status":"ok"`; `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/en` → `200`

### Go toolchain

`apps/api/go.mod` requires **Go 1.25**. The VM may ship an older `go`; set `export GOTOOLCHAIN=auto` (already in agent `~/.bashrc` on this image) so the toolchain downloads 1.25 on first use.

### Docker

Docker requires `sudo` in this environment (`docker compose` / `docker` commands). Storage driver: `fuse-overlayfs` in `/etc/docker/daemon.json`.

### Lint / test / build

See root `package.json`:

| Task | Command |
|------|---------|
| Web ESLint | `npm run lint -w @pulsewatch/web` |
| Go unit tests | `npm run test:unit` |
| Go integration (needs Postgres) | `npm run test:integration` |
| Full E2E (API + web running, ~45s) | `API_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash tests/e2e-test.sh` |
| Build API + web | `npm run build` |

### Browser API calls in dev

The web client uses same-origin `/api/*` in the browser (`apps/web/src/lib/api.ts`). Local dev relies on Next.js `rewrites` in `apps/web/next.config.ts` to proxy to `http://127.0.0.1:4000`. Production uses Nginx instead.

If browser auth calls fail but `curl` to `:4000` works, ensure both services are on the correct ports (API 4000, web 3000) and that `CORS_ORIGINS` in `.env` includes `http://localhost:3000` and `http://127.0.0.1:3000`.

### Deploy / secrets

Production deploy and SSH credentials are documented in `DEPLOYMENT.md` and local `环境信息` (not in Git). Cloud agents typically do not deploy unless explicitly asked.

### Product conventions

See `.cursor/rules/pulsewatch.mdc` for stack, i18n (`en`/`zh`), and mandatory post-change workflow when modifying application code.
