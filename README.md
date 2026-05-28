# PulseWatch

**PulseWatch** 是一款面向全球市场的英文网站监控 SaaS 产品，采用 Freemium 商业模式，为个人开发者、初创团队与 Agency 提供外部可用性监控、智能趋势洞察与异常检测能力。

> *Monitor smarter. Alert faster. Stay discoverable.*

---

## 项目简介

PulseWatch 定位在 UptimeRobot 商用限制与 Better Stack 全栈复杂度之间的**甜蜜点**——对开发者友好的免费层、可预测定价、内置趋势与异常洞察，并以 SEO 工具矩阵驱动可持续获客。早期 **Founding Member $1/mo Pro** 计划用于快速获客。

**核心差异化**：

- **Commercial-friendly Free**：个人项目与早期 SaaS 可合法使用免费层
- **Insights, not just pings**：默认展示 p95 延迟趋势、异常尖峰、SSL/域名到期时间线
- **Discoverable by design**：免费 SSL 检测器、Uptime 计算器、对比页 → 自然注册转化
- **Status pages that sell**：公开状态页 PLG 传播

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [产品需求文档（PRD）](docs/PRD.md) | 竞品研究、产品愿景、功能需求、UI/UX 与用户管理需求、非功能需求 |
| [UI/UX 设计规范](docs/UI-UX-DESIGN.md) | 设计系统、页面线框、响应式、暗色模式、无障碍、转化优化 |
| [用户与权限管理](docs/USER-MANAGEMENT.md) | RBAC 角色、权限矩阵、账户设置、团队管理、认证流程、API 概要 |
| [技术设计规格书](docs/TECHNICAL-DESIGN.md) | 系统架构、前端栈、认证架构、RBAC 数据模型、多租户 |
| [定价与增长策略](docs/PRICING-AND-GROWTH.md) | Freemium 定价、转化漏斗、SEO 与 PLG 获客 |
| [路线图与指标](docs/ROADMAP.md) | MVP 范围、Phase 2–3 路线图、北极星指标、实施计划 |

---

## 快速参考

### 定价层级（USD）

> **🎉 早期获客**：Founding Member 计划 — 所有付费档 **1 折终身锁价**（Pro **$1**/Team **$4**/Business **$10** 月）。详见 [定价与增长策略](docs/PRICING-AND-GROWTH.md#b4-早期获客定价计划early-access--launch-pricing)。

#### 标准价（Sunset 后新用户）

| 维度 | Free | Pro $12/月 | Team $39/月 | Business $99/月 |
|------|------|------------|-------------|-----------------|
| 监控数量 | 15 | 50 | 150 | 500 |
| 检测间隔 | 5 分钟 | 1 分钟 | 60 秒 | 30 秒 |
| 探针区域 | 2 | 5 | 12 | 全部 20+ |
| 历史保留 | 90 天 | 13 个月 | 24 个月 | 36 个月 |
| 告警渠道 | Email, Webhook | + Slack, Discord | + PagerDuty, MS Teams | + SMS 500 条/月 |
| 状态页 | 1（品牌水印） | 3 + 自定义子域 | 10 + 白标选项 | 无限 + SSO（路线图） |
| 团队成员 | 1 | 1 | 5 seats | 20 seats |
| 商用 | ✅（≤$10k ARR 或 hobby） | ✅ | ✅ | ✅ |

#### Founding Member 早期价（前 5,000 名 / 上线 12 个月内）

| 维度 | Free | Pro **$1/月** | Team **$4/月** | Business **$10/月** |
|------|------|---------------|----------------|---------------------|
| 功能配额 | 同标准（+3 监控） | 同 Pro 标准价 | 同 Team 标准价 | 同 Business 标准价 |
| 价格锁定 | — | ✅ 终身 | ✅ 终身 | ✅ 终身 |
| 身份标识 | — | Founding Member 徽章 | Founding Member 徽章 | Founding Member 徽章 |

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端 | Next.js 15 + React + Tailwind + shadcn/ui |
| API | Go (Fiber/Chi) 或 Node (Fastify) |
| 认证 | Auth.js / Clerk / 自研 JWT + OAuth |
| 关系库 | PostgreSQL 16 |
| 缓存/队列 | Redis 7 + Redis Streams |
| 时序库 | ~~ClickHouse~~ **PostgreSQL 分区表**（MVP 不使用 ClickHouse） |
| 探针 Agent | Go 单二进制 |
| 邮件 | Resend / Postmark |
| 计费 | Stripe Billing |
| 基础设施 | AWS/GCP + Fly.io 边缘探针 |

### MVP 时间线

| 阶段 | 周期 | 核心交付 |
|------|------|----------|
| Phase 1 MVP | 8–12 周 | Premium UI、Landing、用户设置、Monitors 管理、HTTP/TCP/Ping/Keyword/SSL、邮件/Webhook 告警、Dashboard、状态页、Stripe Pro、SSL Checker |
| Phase 2 | +8 周 | Team RBAC 与邀请、2FA、⌘K、Slack/Discord、SLA 报告、异常检测 |
| Phase 3 | +12 周 | Business、SMS、PagerDuty、Terraform、SOC2 准备 |

---

## 环境信息

本地开发环境配置见 [`环境信息`](环境信息) 文件（不纳入版本控制敏感信息）。

---

**文档版本**：v1.1  
**竞品基准**：UptimeRobot、Better Stack、Pingdom、StatusCake、Datadog Synthetics、Site24x7、New Relic
