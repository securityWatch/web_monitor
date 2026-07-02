# PulseWatch

[English](./README.md) | **中文**

[![PulseWatch](https://example.pulsewatch.io/api/v1/public/badge/your_token.svg)](https://github.com/securityWatch/web_monitor)

**PulseWatch** 是一款可自托管的网站监控平台。支持 HTTP/API/SSL/DNS 等多种监控，以及邮件、Webhook、Slack、钉钉、飞书等告警渠道。

> **自托管**：克隆本仓库，复制 `.env.example` → `.env`，按 [DEPLOYMENT.md](./DEPLOYMENT.md) 部署。

---

## 功能概览

| 类别 | 能力 |
|------|------|
| **监控类型** | HTTP/HTTPS、TCP、Ping、关键词、SSL、DNS、心跳、域名、PageSpeed、篡改、API/JSON |
| **告警渠道** | 邮件、Webhook、Slack、钉钉、飞书、企业微信等 |
| **故障 / 状态页** | 时间线、备注、公开状态页、公告 |
| **仪表盘** | KPI、响应趋势、失败列表 |
| **公开工具** | SSL、DNS、Ping、端口、HTTP 头、徽章生成等 |
| **国际化** | 英文 + 中文 |
| **微信小程序** | 可选，需自行配置 AppID 与服务器域名 |

## 本地开发

```bash
git clone https://github.com/securityWatch/web_monitor.git
cd web_monitor

cp .env.example .env
export GOTOOLCHAIN=auto
cd apps/api && go run ./cmd/server
cd apps/web && npm install && npm run dev
```

## 一键部署（自托管）

配置环境变量后，在仓库根目录执行：

```bash
export DEPLOY_HOST=YOUR_SERVER_IP
export DEPLOY_USER=ubuntu
export DEPLOY_PASSWORD=你的SSH密码
export PG_PASSWORD=你的Postgres密码
export APP_DOMAINS=example.pulsewatch.io
export NEXT_PUBLIC_SITE_URL=https://example.pulsewatch.io

npm run deploy          # 日常：API + Web
npm run deploy:first    # 首次全量安装
```

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 安全

- 勿将 `.env`、密码、Webhook URL 提交到 Git
- 发布前运行：`node scripts/oss-verify-secrets.js`
- 生产环境务必更换 `JWT_SECRET` 等默认值

见 [SECURITY.md](./SECURITY.md)。

## 许可证

见 [LICENSE](./LICENSE)。
