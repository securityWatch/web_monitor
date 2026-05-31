# PulseWatch — Agent Guide

## Cursor Cloud specific instructions

### Services (local dev)

| Service | Port | Agent responsibility |
|---------|------|----------------------|
| PostgreSQL 16 | **6541**（服务器 systemd）/ `.env` 中配置 | **不要**由 Agent 启动；假定已由 systemd 运行 |
| Go API | 4000 | 启动（`go run` 或 systemd `pulsewatch-api`） |
| Next.js web | 3000 | 启动（`next dev` 或 systemd `pulsewatch-web`） |
| Redis | 6379 | 不需要（代码未使用） |

### PostgreSQL（systemd，勿用 Docker）

- 数据库由宿主机 **systemd 管理的 PostgreSQL** 提供，**不要**执行 `docker compose up postgres` 或单独拉起 Postgres 容器。
- 连接信息在仓库根目录 **`.env`**（自 `.env.example` 复制）及 `apps/api/internal/config/config.go` 默认值；生产/服务器详见 **`DEPLOYMENT.md`**（例如 `127.0.0.1:6541`，库名 `pulsewatch`）。
- 集成测试可使用 `TEST_DATABASE_URL`（见 `DEPLOYMENT.md`），未设置时回退到 `DATABASE_URL`。
- 确认数据库可用（示例）：`systemctl status postgresql`（或本机实际单元名），并按 `.env` 中的端口做连通性检查。

### Dev servers（API + Web）

**不要**在 `source .env` 后直接跑 `npm run dev`：`.env` 的 `PORT=4000` 会被 Next.js 继承，与 API 争用 4000。

```bash
export GOTOOLCHAIN=auto
set -a && source .env && set +a
npx concurrently "cd apps/api && go run ./cmd/server" "PORT=3000 npm run dev -w @pulsewatch/web"
```

Smoke：`curl -s http://127.0.0.1:4000/health` → `"status":"ok"`；`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/en` → `200`

生产环境 API/Web 由 **systemd**（`pulsewatch-api`、`pulsewatch-web`）+ **Nginx :80** 提供，见 `DEPLOYMENT.md`。

### Go toolchain

`apps/api/go.mod` 需要 **Go 1.25**。设置 `export GOTOOLCHAIN=auto`，以便自动下载工具链。

### Lint / test / build

| Task | Command |
|------|---------|
| Web ESLint | `npm run lint -w @pulsewatch/web` |
| Go unit tests | `npm run test:unit` |
| Go integration（需已运行的 Postgres） | `npm run test:integration` |
| E2E（API + web 已起，约 45s） | `API_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash tests/e2e-test.sh` |
| Build API + web | `npm run build` |

### Browser API calls in dev

浏览器走同源 `/api/*`（`apps/web/src/lib/api.ts`）；本地通过 `apps/web/next.config.ts` 的 `rewrites` 代理到 `127.0.0.1:4000`。生产由 Nginx 反代。

### Deploy / secrets

见 `DEPLOYMENT.md` 与本地 `环境信息`（不入库）。**运行时变更完成后必须自动部署到生产**（`cd deploy && node redeploy-api.js` / `redeploy-web.js`），不要向用户确认是否部署。

### Product conventions

见 `.cursor/rules/pulsewatch.mdc`（栈、i18n、改代码后的提交流程）。
