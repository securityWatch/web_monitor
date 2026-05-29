# PulseWatch 部署文档

> 敏感凭据请勿提交 Git。实际密码见服务�?`/opt/pulsewatch/api/.env` 与本�?`环境信息` 文件�?

## 服务器信�?

| 项目 | �?|
|------|-----|
| IP | `49.234.112.108` |
| SSH 用户 | `ubuntu` |
| SSH 密码 | �?`环境信息`（不纳入 Git�?|
| 应用目录 | `/opt/pulsewatch` |

## 对外访问

**对外访问统一使用 80 端口**（Nginx）。用户无需也不应使用 :3000 或 :4000 访问产品；3000/4000 仅本机 systemd 上游，由 Nginx 反代。

> Web 服务请勿设置 HOSTNAME=127.0.0.1（会导致 next-intl 中间件自代理 /en、/zh 返回 500）。生产使用 HOSTNAME=0.0.0.0 绑定本机，对外仍只经 80 入口。

## 访问地址

| 服务 | 端口 | URL |
|------|------|-----|
| Web（Nginx 反代，推荐） | 80 | http://49.234.112.108/en |
| Web 中文 | 80 | http://49.234.112.108/zh |
| Web（直连，仅内网/调试） | 3000 | http://127.0.0.1:3000（勿依赖公网 :3000） |
| API（经 Nginx） | 80 | http://49.234.112.108/api/v1/... |
| API Health | 80 | http://49.234.112.108/health |

### i18n 路由

- 英文：http://49.234.112.108/en
- 中文：http://49.234.112.108/zh
- 浏览�?`Accept-Language` 首次访问自动跳转；手动切换见页头 EN/中文 按钮（Cookie: `PULSEWATCH_LOCALE`�?

## Nginx 反向代理

- 仓库配置: `deploy/nginx/pulsewatch.conf`（与 `deploy/nginx.conf` 同步）
- 服务器: `/etc/nginx/sites-available/pulsewatch` → `sites-enabled/pulsewatch`
- 对外仅 **80**；/ → Web:3000，/api/ → API:4000，/health → API
- 转发头: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto；`/` 含 WebSocket
- 同步: `cd deploy && node apply-nginx.js` 后 `nginx -t && systemctl reload nginx`
- `NEXT_PUBLIC_API_URL=http://49.234.112.108`（无 :4000）；变更后需 rebuild Web

## 测试账户

可在注册页自行创建。E2E 测试使用随机 `@test.pulsewatch.io` 邮箱�?

推荐演示账户（需自行注册一次）�?

| 字段 | 建议�?|
|------|--------|
| 邮箱 | `demo@pulsewatch.io` |
| 密码 | `DemoPass123` |

## 运行方式（生产）

使用 **systemd 原生部署**（非 Docker）：

| 服务 | 单元�?| 说明 |
|------|--------|------|
| Go API + 调度�?| `pulsewatch-api` | `/opt/pulsewatch/api/pulsewatch-api` |
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
node redeploy-web.js               # 仅前�?
node run-e2e.js                    # 在服务器�?E2E
```

## 环境变量

配置文件�?*`/opt/pulsewatch/api/.env`**�?*`/opt/pulsewatch/web/.env`**

本地开发：复制 `.env.example` �?`.env`

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `postgresql://postgres:prs%402018@127.0.0.1:6541/pulsewatch`（`@` 需 URL 编码�?`%40`�?|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT 密钥 |
| `PORT` | API 端口�?000�?|
| `CORS_ORIGIN` | 前端来源 |
| `NEXT_PUBLIC_API_URL` | 浏览器用 API 地址 |
| `SMTP_MODE` | `console` �?`smtp` |

## 数据�?

- PostgreSQL 16，端�?**6541**，库�?**pulsewatch**
- 连接串格式：`postgresql://postgres:<URL编码密码>@127.0.0.1:6541/pulsewatch`
- **不使�?ClickHouse**；时序数据存 PostgreSQL 分区�?`check_results`

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

### E2E 验收（服务器本地�?

```bash
API_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash tests/e2e-test.sh
```

### 测试结果�?026-05-29�?

| 测试�?| 结果 |
|--------|------|
| Health check | �?PASS |
| 注册 + 登录 | �?PASS |
| JWT refresh | �?PASS |
| Monitor CRUD | �?PASS |
| 自动检�?+ 结果存储 | �?PASS�?5s 内） |
| Dashboard 统计 | �?PASS |
| 密码修改 | �?PASS |
| i18n /en /zh 路由 | �?PASS |
| 删除监控 | �?PASS |
| 10 并发监控稳定�?| �?PASS |
| API 限流不崩�?| �?PASS |
| Go 单元测试 (services) | �?11/11 PASS |
| 公网 HTTP /en /zh | �?200 |

## 本地开�?

```bash
cp .env.example .env
cd apps/api && go run ./cmd/server    # :4000
cd apps/web && npm run dev            # :3000 �?/en
```

## 架构

- **Go** �?`apps/api/`（Gin + pgx + JWT + 内嵌调度器）
- **Next.js 15** �?`apps/web/`（next-intl 中英文、暗�?UI�?
- **PostgreSQL** �?唯一数据�?

## 故障排查

### pulsewatch-web 启动失败（找不到 server.js�?
Next.js monorepo standalone 入口�?`web/.next/standalone/apps/web/server.js`，systemd �?`WorkingDirectory` 必须指向该目录：

```bash
WorkingDirectory=/opt/pulsewatch/web/.next/standalone/apps/web
```

部署后需复制静态资源：

```bash
cp -r /opt/pulsewatch/web/.next/static /opt/pulsewatch/web/.next/standalone/apps/web/.next/
cp -r /opt/pulsewatch/web/public /opt/pulsewatch/web/.next/standalone/apps/web/
```

本地可执行：`cd deploy && node fix-web.js`

### 公网端口

- **80**：Nginx 反代 Web �?`/health`、`/api/`（推荐对外访问）
- **3000 / 4000**：仅服务器本机或内网；云防火墙未开放时公网直连会超时，属正�?
