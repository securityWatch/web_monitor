# PulseWatch — 需求差距与待办（文档对齐基准）

**文档版本**：v1.0  
**更新日期**：2026-05-30  
**用途**：与 [PRD](PRD.md)、[ROADMAP](ROADMAP.md) 对照的**真实实现状态**；`ISSUES.md` 任务状态以此为准。

**实现基准**：Go API + Next.js 15 + PostgreSQL 分区表（**无 ClickHouse / Redis 运行时依赖**）。详见 [ARCHITECTURE-DATA](ARCHITECTURE-DATA.md)。

---

## 图例

| 标记 | 含义 |
|------|------|
| ✅ | 已交付，可验收 |
| 🔶 | 部分实现 / 依赖环境配置 / MVP 简化 |
| ❌ | 未实现或 PRD 明确要求但未做 |
| 📋 | 文档/运维项，非纯代码 |

---

## Phase 1 MVP（ROADMAP §G.1）

| 需求 | 状态 | 说明 |
|------|------|------|
| Email + 密码注册登录 | ✅ | |
| Google/GitHub OAuth | 🔶 | 代码完整；需 `GOOGLE_*` / `GITHUB_*` |
| Premium UI（暗色、Tailwind） | ✅ | 未使用 shadcn 包，自定义组件 |
| Landing + Founding CTA + 名额 | ✅ | 「Live Demo」为静态预览，非交互演示 |
| Personal Org + Profile/密码 | ✅ | |
| RBAC Owner/Member/Viewer | 🔶 | API 层 viewer 限制；邀请 UI 基础 |
| Monitors CRUD + Wizard + 详情 | ✅ | 列表为手写窗口虚拟化 |
| HTTP/TCP/Ping/Keyword/SSL | ✅ | + heartbeat/dns/domain/pagespeed/tamper |
| 2 区域 + 套餐间隔门控 | 🔶 | N-of-M 有；**真地理探针**需 `PROBE_DISPATCH` + worker |
| Email + Webhook 告警 | ✅ | |
| Dashboard + Incidents | ✅ | |
| 状态页 | ✅ | 自定义域字段有；全自动 CNAME/证书需运维 |
| Stripe Founding + 标准价 | 🔶 | 需 `STRIPE_*`；未配置则 checkout 不可用 |
| Founding 徽章/计数 | ✅ | |
| SSL Checker | ✅ | |
| 90 天保留 + 降采样 | 🔶 | 7 天原始 + 5 分钟 rollup + 90 天 DROP 分区；`CHECK_*_RETENTION_DAYS` | 仅分区表 + 查询窗口；**无自动 TTL/降采样** |
| WCAG + axe CI | 🔶 | 无 axe Playwright CI 门禁 |
| 登录 5 次 lockout 15min | ✅ | `login_lockouts` 表 + API `ACCOUNT_LOCKED` |
| Session 管理 UI | ✅ | `/me/sessions` + Settings → Security |

**原「MVP 不做」但代码已做**：SMS、PagerDuty、DNS、2FA、团队邀请、⌘K 等 — 见 Phase 2–4。

---

## Phase 2–4（概要）

| 能力 | 状态 | 说明 |
|------|------|------|
| API Keys、Magic Link、2FA、审计 | ✅ | |
| SLA 导出 | 🔶 | CSV + HTML，**无 PDF** |
| 多告警渠道（Slack/PD/Teams/SMS/语音/国内 IM） | 🔶 | 需对应 env / migration |
| 真分布式探针 | 🔶 | `apps/api/cmd/probe-worker`；默认未启用 |
| Terraform Provider | 🔶 | 仅 `integrations/terraform` 示例 + client |
| SSO OIDC | 🔶 | org 配置 API；无完整 IdP 登录 UI 闭环 |
| 故障截图 | 🔶 | 占位 PNG + data URI，非 Chromium/S3 |
| API/JSON 监控类型 | ✅ | `api_json` + JSONPath 断言 | PRD Pro+，枚举中无 |

---

## 功能对齐优先级（开发）

| 序 | 项 | 类型 |
|----|-----|------|
| 1 | 登录 lockout | ✅ |
| 2 | Session 管理 UI | ✅ |
| 3 | 探针生产部署清单 | 📋 DEPLOYMENT |
| 4 | check_results 保留/归档 | ✅ |
| 5 | API/JSON 监控 | ✅ |
| 6 | 真截图 + S3 | 代码 |
| 7 | Terraform 官方 Provider | 代码 |
| 8 | SSO 完整登录流 | 代码 |
| 9 | Live Demo 页或改 PRD 文案 | 产品/代码 |
| 10 | axe CI | CI |

---

## 相关文档

- [ROADMAP.md](ROADMAP.md) — MVP 勾选已与本文同步
- [ISSUES.md](ISSUES.md) — 任务状态表
- [ARCHITECTURE-DATA.md](ARCHITECTURE-DATA.md) — 数据与保留策略真相
- [DEPLOYMENT.md](../DEPLOYMENT.md) — 探针与 env
