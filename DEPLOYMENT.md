# PulseWatch 部署文档

> 敏感凭据请勿提交 Git。实际密码见服务器 `/opt/pulsewatch/api/.env` 与本地 `环境信息` 文件。

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP | `49.234.112.108` |
| SSH 用户 | `ubuntu` |
| SSH 密码 | 见 `环境信息`（不纳入 Git） |
| 应用目录 | `/opt/pulsewatch` |

## 访问地址

| 服务 | 端口 | URL |
|------|------|-----|
| Web（Nginx 反代，推荐） | 80 | http://49.234.112.108/en |
| Web 中文 | 80 | http://49.234.112.108/zh |
| Web（直连） | 3000 | http://49.234.112.108:3000 |
| API | 4000 | http://49.234.112.108:4000 |
| API Health | 80/4000 | http://49.234.112.108/health |

### i18n 路由

- 英文：http://49.234.112.108/en
- 中文：http://49.234.112.108/zh
- 浏览器 `Accept-Language` 首次访问自动跳转；手动切换见页头 EN/中文 按钮（Cookie: `PULSEWATCH_LOCALE`）

## 测试账户

可在注册页自行创建。E2E 测试使用随机 `@test.pulsewatch.io` 邮箱。

推荐演示账户（需自行注册一次）：

| 字段 | 建议值 |
|------|--------|
| 邮箱 | `demo@pulsewatch.io` |
| 密码 | `DemoPass123` |

## 运行方式（生产）

使用 **systemd 原生部署**（非 Docker）：

| 服务 | 单元名 | 说明 |
|------|--------|------|
| Go API + 调度器 | `pulsewatch-api` | `/opt/pulsewatch/api/pulsewatch-api` |
| Next.js Web | `pulsewatch-web` | `node server.js` @ `web/.next/standalone/apps/web` |
| 反向代理 | `nginx` | `/etc/nginx/sites-available/pulsewatch` |

```bash
sudo systemctl status pulsewatch-api pulsewatch-web nginx
sudo systemctl restart pulsewatch-api pulsewatch-web
sudo journalctl -u pulsewatch-api -f
sudo journalctl -u pulsewatch-web -f
```

### 重新部署

```bash
# 本地 Windows
cd deploy && node deploy.js        # 全量部署
node redeploy-web.js               # 仅前端
node run-e2e.js                    # 在服务器跑 E2E
```

## 环境变量

配置文件：**`/opt/pulsewatch/api/.env`**、**`/opt/pulsewatch/web/.env`**

本地开发：复制 `.env.example` → `.env`

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `postgresql://postgres:prs%402018@127.0.0.1:6541/pulsewatch`（`@` 需 URL 编码为 `%40`） |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT 密钥 |
| `PORT` | API 端口（4000） |
| `CORS_ORIGIN` | 前端来源 |
| `NEXT_PUBLIC_API_URL` | 浏览器用 API 地址 |
| `SMTP_MODE` | `console` 或 `smtp` |

## 数据库

- PostgreSQL 16，端口 **6541**，库名 **pulsewatch**
- 连接串格式：`postgresql://postgres:<URL编码密码>@127.0.0.1:6541/pulsewatch`
- **不使用 ClickHouse**；时序数据存 PostgreSQL 分区表 `check_results`

## 测试

### Go 单元测试

```bash
cd apps/api && go test ./internal/services/... -v
```

### Go 集成测试

```bash
export TEST_DATABASE_URL=postgresql://postgres:prs%402018@49.234.112.108:6541/pulsewatch
cd apps/api && go test ./internal/handlers/... -v
```

### E2E 验收（服务器本地）

```bash
API_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash tests/e2e-test.sh
```

### 测试结果（2026-05-29）

| 测试项 | 结果 |
|--------|------|
| Health check | ✅ PASS |
| 注册 + 登录 | ✅ PASS |
| JWT refresh | ✅ PASS |
| Monitor CRUD | ✅ PASS |
| 自动检测 + 结果存储 | ✅ PASS（35s 内） |
| Dashboard 统计 | ✅ PASS |
| 密码修改 | ✅ PASS |
| i18n /en /zh 路由 | ✅ PASS |
| 删除监控 | ✅ PASS |
| 10 并发监控稳定性 | ✅ PASS |
| API 限流不崩溃 | ✅ PASS |
| Go 单元测试 (services) | ✅ 11/11 PASS |
| 公网 HTTP /en /zh | ✅ 200 |

## 本地开发

```bash
cp .env.example .env
cd apps/api && go run ./cmd/server    # :4000
cd apps/web && npm run dev            # :3000 → /en
```

## 架构

- **Go** — `apps/api/`（Gin + pgx + JWT + 内嵌调度器）
- **Next.js 15** — `apps/web/`（next-intl 中英文、暗色 UI）
- **PostgreSQL** — 唯一数据库
