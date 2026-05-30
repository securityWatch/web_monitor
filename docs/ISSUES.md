# PulseWatch 功能任务清单

## Phase 1 — 核心闭环 ✅ 已完成

见 Git 历史 / 上一版本文档（P0–P2 全部 ✅）

---

## Phase 2 — 增长与开发者体验 ✅ 已完成

| ID | 任务 | 状态 |
|----|------|------|
| P2-5 | API Keys 管理 + Bearer 认证 | ✅ |
| P2-6 | 密码重置（忘记密码 → 邮件链接 → 重置） | ✅ |
| P2-7 | DNS 监控（A/AAAA/CNAME/MX） | ✅ |
| P2-8 | 告警降噪：15 分钟去重 + Flapping 抑制 | ✅ |
| P2-9 | 多区域 N-of-M 投票（多数失败才 DOWN） | ✅ |
| P2-10 | 监控模板（API/WordPress/Stripe/SSL/DNS/Heartbeat） | ✅ |
| P2-11 | 免费 SSL Checker 工具页（SEO 获客） | ✅ |
| P2-12 | Founding Member 徽章（账单页） | ✅ |

## Phase 3 — 企业级功能 ✅ 已完成

| ID | 任务 | 状态 |
|----|------|------|
| P3-1 | 邮箱验证流程（未验证限 3 监控） | ✅ |
| P3-2 | Magic Link 登录 | ✅ |
| P3-3 | 2FA TOTP | ✅ |
| P3-4 | Org Switcher 多组织切换 | ✅ |
| P3-5 | 审计日志 | ✅ |
| P3-6 | SLA HTML 报告（CSV + HTML 导出） | ✅ |
| P3-7 | 状态页邮件订阅 + 自定义域名 | ✅ |
| P3-8 | 独立定价页 `/pricing` + FAQ schema | ✅ |
| P3-9 | 配额触顶升级弹窗（Founding $1 CTA） | ✅ |
| P3-10 | OpenAPI 文档 + Terraform 示例 | ✅ |

## Phase 4 — 竞品核心功能 ✅ 已完成

| ID | 任务 | 状态 |
|----|------|------|
| P4-1 | SMS 告警（Twilio，可选） | ✅ |
| P4-2 | MS Teams MessageCard 告警 | ✅ |
| P4-3 | 故障响应取证（responseBodySnippet） | ✅ |
| P4-4 | 域名到期监控（RDAP WHOIS） | ✅ |
| P4-5 | 页面速度监控（TTFB 阈值） | ✅ |
| P4-6 | 事件协作流（时间线/备注/工作流） | ✅ |
| P4-7 | 告警智能合并（5 分钟同窗） | ✅ |
| P4-8 | On-Call 排班 MVP | ✅ |
| P4-9 | 状态页事件公告联动 | ✅ |
| P4-10 | 钉钉/飞书/企微告警 | ✅ migration 008 已部署 |

---

## Phase 5 — 差距补齐 ✅ 已完成（2026-05-30）

**完整 backlog、验收标准、测试与部署循环** → [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md)  
**产品阶段与套餐门控** → [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md)  
**竞品差距矩阵** → [COMPETITOR-ANALYSIS.md §15](COMPETITOR-ANALYSIS.md#15-pulsewatch-差距矩阵phase-5-基准)

| ID | 任务 | 优先级 | 状态 |
|----|------|:------:|------|
| P5-1 | 真分布式探针 Worker | P0 | ✅ 2026-05-30 |
| P5-2 | 移动端底栏导航 | P0 | ✅ 2026-05-30 |
| P5-3 | 国内 IM 告警部署 | P0 | ✅ 2026-05-30 |
| P5-4 | On-Call 升级 + 事件指挥台 UI | P1 | ✅ 2026-05-30 |
| P5-5 | 故障截图 + 取证 Tab | P1 | ✅ MVP |
| P5-6 | 状态页公告 + uptime 历史 | P1 | ✅ 2026-05-30 |
| P5-7 | Twilio 语音告警 | P1 | ✅ 2026-05-30 |
| P5-8 | Monitors 虚拟滚动 + 批量 | P1 | ✅ 2026-05-30 |
| P5-9 | 套餐配额硬门控 | P1 | ✅ 2026-05-30 |
| P5-10 | Terraform Provider v0.1 | P1 | ✅ partial — client MVP |
| P5-11 | Core Web Vitals 扩展 | P2 | ✅ LCP/FCP estimate |
| P5-12 | ⌘K 命令面板 | P2 | ✅ 2026-05-30 |
| P5-13 | SSO OIDC | P2 | ✅ partial — config API |
| P5-14 | Opsgenie 集成 | P2 | ✅ 2026-05-30 |
| P5-15 | 竞品对比落地页 | P1 | ✅ 2026-05-30 |

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `WEB_URL` | OAuth / 密码重置 / Stripe 跳转 |
| `STRIPE_SECRET_KEY` / `STRIPE_PRO_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | 付费 |
| `SMTP_*` | 密码重置与告警邮件 |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS 告警 |
