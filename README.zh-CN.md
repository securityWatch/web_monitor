# PulseWatch

[English](./README.md) | **中文**

[![PulseWatch](https://gkao.com.cn/api/v1/public/badge/your_token.svg)](https://gkao.com.cn)

**PulseWatch** 是一款开源友好的网站监控 SaaS 平台，提供免费套餐。可监控网站、API、SSL 证书、DNS 等，并通过邮件、Webhook、Slack、钉钉、飞书、企业微信等渠道告警。

> **在线演示**：[https://gkao.com.cn](https://gkao.com.cn)

---

## 功能概览

| 类别 | 能力 |
|------|------|
| **监控类型** | HTTP/HTTPS、TCP、Ping、关键词、SSL 到期、DNS、心跳、域名（RDAP）、PageSpeed、篡改检测、API/JSON |
| **告警渠道** | 邮件、Webhook、Slack、Discord、Teams、钉钉、飞书、企业微信、PagerDuty、Opsgenie、短信、语音 |
| **故障管理** | 时间线、备注、工作流、值班轮换、语音升级、AI 复盘摘要 |
| **状态页** | 公开品牌状态页、自定义域名、邮件订阅、公告 |
| **安全监控** | SSL 分级提醒、DNS 劫持/漂移、页面篡改（含 AI 识别） |
| **仪表盘** | 实时 KPI、24h 响应趋势、最近失败、单监控统计 |
| **公开工具** | SSL 检测、DNS 查询、Ping、端口检测、HTTP 头、重定向链、宕机成本计算、可用率徽章 |
| **国际化** | 英文 + 中文 |
| **团队** | 角色权限、邀请成员 |
| **计费** | 免费 10 个监控；创始会员价 $1/$4/$10 |
| **微信小程序** | 仪表盘、监控、故障、状态页、告警渠道、微信/手机号一键登录 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15、Tailwind 4、next-intl、Recharts |
| 后端 | Go 1.25、Gin、pgx、JWT |
| 数据库 | PostgreSQL 16（分区 `check_results`，不用 ClickHouse） |
| 部署 | Ubuntu + systemd + Nginx + Let's Encrypt / Cloudflare |
| 小程序 | 微信原生（11 页面、5 Tab） |

## 本地开发

### 环境要求

- Go 1.25+（`GOTOOLCHAIN=auto`）
- Node.js 22+
- PostgreSQL 16

### 快速启动

```bash
git clone https://github.com/mafei2021/monitor.git
cd monitor

cp .env.example .env
# 编辑 DATABASE_URL 等

export GOTOOLCHAIN=auto
cd apps/api && go run ./cmd/server    # :4000

# 另开终端
cd apps/web && npm install && npm run dev   # :3000 → /en /zh
```

### 测试

```bash
npm run test:unit
npm run test:integration   # 需本地 Postgres
```

## 一键部署（生产）

在仓库根目录配置环境变量，或写入本地 **`环境信息`** 文件（勿提交 Git）：

```ini
DEPLOY_HOST=49.234.112.108
DEPLOY_USER=ubuntu
DEPLOY_PASSWORD=你的SSH密码
PG_PASSWORD=你的Postgres密码
APP_DOMAINS=gkao.com.cn,www.gkao.com.cn
NEXT_PUBLIC_SITE_URL=https://gkao.com.cn
```

### 常用命令

| 场景 | 命令 |
|------|------|
| **日常发布（API + Web）** | `npm run deploy` |
| **首次全量安装** | `npm run deploy:first` |
| **仅 API** | `npm run deploy:api` |
| **仅 Web** | `npm run deploy:web` |
| **部署后同步开源镜像** | `npm run deploy -- --sync-oss` |

等价于：

```bash
node scripts/deploy-oneclick.js           # 增量
node scripts/deploy-oneclick.js --first   # 首次
```

脚本会自动检查 `http://<DEPLOY_HOST>/health` 与 `/en` 是否可用。

详细说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 开源镜像同步

脱敏后的公开仓库：[securityWatch/web_monitor](https://github.com/securityWatch/web_monitor)

```bash
# 推送私有 main 后自动脱敏并同步到 web_monitor（推荐）
npm run publish:main

# 仅同步（不 push 私有仓库）
npm run sync:oss

# 跳过 OSS 同步
SKIP_OSS_SYNC=1 npm run publish:main
```

Agent / CI 默认在 `git push origin main` 之后执行 `npm run sync:oss`。可选安装 Git hooks：

```bash
npm run hooks:install
```

## 项目结构

```
apps/api/          # Go 后端
apps/web/          # Next.js 前端
apps/miniprogram/  # 微信小程序
deploy/            # 部署脚本
scripts/           # 一键部署、OSS 同步
docs/              # 文档
tests/             # E2E
```

## 贡献

- 勿提交 `.env`、`环境信息`、密钥
- UI 改动需同步 `messages/en.json` 与 `messages/zh.json`
- API 改动请补充测试

## 许可证

见 [LICENSE](./LICENSE)。
