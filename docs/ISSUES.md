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

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `WEB_URL` | OAuth / 密码重置 / Stripe 跳转 |
| `STRIPE_SECRET_KEY` / `STRIPE_PRO_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | 付费 |
| `SMTP_*` | 密码重置与告警邮件 |
