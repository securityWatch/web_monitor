# PulseWatch 功能任务清单

> **状态说明**：✅ 已交付 | 🔶 部分/MVP/需配置 | ❌ 未做  
> **差距明细**：[GAP-BACKLOG.md](GAP-BACKLOG.md) | **MVP 勾选**：[ROADMAP.md](ROADMAP.md)

---

## Phase 1 — 核心闭环

| ID | 任务 | 状态 |
|----|------|------|
| P1-core | 注册/登录/JWT、Monitors、调度、告警、Dashboard、状态页、i18n | ✅ |
| P1-lockout | 登录失败 5 次锁定 15min（PRD） | ✅ |
| P1-session-ui | Session 列表与撤销（PRD UM-05） | ✅ |
| P1-retention | check_results 自动保留/降采样 | ✅ |
| P1-live-demo | 交互式 Live Demo（PRD UX-01） | 🔶 静态 Hero 预览 |

---

## Phase 2 — 增长与开发者体验

| ID | 任务 | 状态 |
|----|------|------|
| P2-5 | API Keys 管理 + Bearer 认证 | ✅ |
| P2-6 | 密码重置 | ✅ |
| P2-7 | DNS 监控 | ✅ |
| P2-8 | 告警降噪 + Flapping | ✅ |
| P2-9 | 多区域 N-of-M | 🔶 逻辑 ✅；真地理探针见 P5-1 |
| P2-10 | 监控模板 | ✅ |
| P2-11 | SSL Checker | ✅ |
| P2-12 | Founding Member 徽章 | ✅ |
| P2-pdf-sla | SLA **PDF** 导出 | ❌ 仅 CSV/HTML |

---

## Phase 3 — 企业级功能

| ID | 任务 | 状态 |
|----|------|------|
| P3-1 | 邮箱验证（未验证限 3 监控） | ✅ |
| P3-2 | Magic Link | ✅ |
| P3-3 | 2FA TOTP | ✅ |
| P3-4 | Org Switcher | ✅ |
| P3-5 | 审计日志 | ✅ |
| P3-6 | SLA CSV + HTML | ✅ |
| P3-7 | 状态页订阅 + custom_domain 字段 | 🔶 |
| P3-8 | `/pricing` + FAQ | ✅ |
| P3-9 | 配额升级弹窗 | ✅ |
| P3-10 | OpenAPI + Terraform **示例** | 🔶 非官方 Provider |

---

## Phase 4 — 竞品核心功能

| ID | 任务 | 状态 |
|----|------|------|
| P4-1 | SMS（Twilio） | 🔶 需 env |
| P4-2 | MS Teams | ✅ |
| P4-3 | responseBodySnippet 取证 | ✅ |
| P4-4 | 域名到期（RDAP） | ✅ |
| P4-5 | Pagespeed / TTFB | ✅ |
| P4-6 | 事件协作流 | ✅ |
| P4-7 | 告警合并 | ✅ |
| P4-8 | On-Call MVP | ✅ |
| P4-9 | 状态页事件联动 | ✅ |
| P4-10 | 钉钉/飞书/企微 | 🔶 migration `008` + env |

---

## Phase 5 — 差距补齐

| ID | 任务 | 优先级 | 状态 |
|----|------|:------:|------|
| P5-1 | 真分布式探针 Worker | P0 | ✅ 2026-05-30 |
| P5-2 | 移动端底栏导航 | P0 | ✅ 2026-05-30 |
| P5-3 | 国内 IM 告警部署 | P0 | ✅ 2026-05-30 |
| P5-4 | On-Call 升级 + 事件指挥台 UI | P1 | ✅ 2026-05-30 |
| P5-5 | 故障截图 + 取证 Tab | P1 | ✅ usable — 标注 PNG + body 片段 + 详情取证区 |
| P5-6 | 状态页公告 + uptime 历史 | P1 | ✅ 2026-05-30 |
| P5-7 | Twilio 语音告警 | P1 | ✅ 2026-05-30 |
| P5-8 | Monitors 虚拟滚动 + 批量 | P1 | ✅ 2026-05-30 |
| P5-9 | 套餐配额硬门控 | P1 | ✅ 2026-05-30 |
| P5-10 | Terraform Provider v0.1 | P1 | ✅ usable — client + `examples/rest-monitor.tf` |
| P5-11 | Core Web Vitals 扩展 | P2 | ✅ LCP/FCP 估算（UI 标注非实验室 CWV） |
| P5-12 | ⌘K 命令面板 | P2 | ✅ 2026-05-30 |
| P5-13 | SSO OIDC | P2 | ✅ OIDC 登录流（需 Business + org 成员） |
| P5-14 | Opsgenie 集成 | P2 | ✅ 2026-05-30 |
| P5-15 | 竞品对比落地页 | P1 | ✅ 2026-05-30 |

**Phase 7 延后**：Headless Chromium 真页面截图、HashiCorp Terraform plugin 注册发布、真实 Chrome CWV 实验室采集。

---

## Phase 6 — 安全与完整性监控

| ID | 任务 | 优先级 | 状态 |
|----|------|:------:|------|
| P6-1 | SSL 分级告警 | P0 | ✅ |
| P6-2 | DNS 基线/漂移 | P0 | ✅ |
| P6-3 | Tamper fingerprint | P1 | ✅ |
| P6-4 | 内容策略 blocklist | P1 | ✅ |
| P6-5 | 安全监控 UI | P1 | ✅ |

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth / 也可作 org OIDC 测试 |
| Org SSO | Settings → 组织 OIDC（Business）；回调 `GET /api/v1/auth/sso/callback` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `WEB_URL` | OAuth / 密码重置 / Stripe |
| `STRIPE_SECRET_KEY` / `STRIPE_PRO_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | 付费 |
| `SMTP_*` | 邮件 |
| `TWILIO_*` | SMS/语音 |
| `PROBE_DISPATCH` / `PROBE_SECRET` / `PROBE_REGION` | 分布式探针 |
| `S3_*` | 截图对象存储（未来） |
