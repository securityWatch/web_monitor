# PulseWatch — 路线图与指标

**文档版本**：v1.1  
**关联文档**：[产品需求文档（PRD）](PRD.md) | [技术设计规格书](TECHNICAL-DESIGN.md)

---

## G. MVP 范围与路线图

### G.1 Phase 1 — MVP（8–12 周）

**必须交付（P0）**：

- [ ] Email + Google/GitHub 注册登录
- [ ] **Premium UI 脚手架**：Next.js + Tailwind + shadcn/ui 设计系统、暗色模式
- [ ] **Landing Page**：Hero、社会证明、Live Demo、定价预览、**Founding Member CTA（$1/mo Pro + 名额计数器）**
- [ ] **用户管理 MVP**：Personal Org 自动创建、Profile/密码/Email 设置
- [ ] **RBAC 基础**：Owner 单用户；Member/Viewer 角色模型预留（Team 套餐 Phase 2 启用邀请）
- [ ] **Monitors 管理页**：列表、搜索、筛选、创建 Wizard、详情页
- [ ] HTTP/HTTPS、TCP、Ping、Keyword、SSL 到期监控
- [ ] 2 探针区域；Free 5 分钟 / 付费档仅 Pro 手动开通
- [ ] 邮件 + Webhook 告警
- [ ] 仪表盘：uptime %、响应时间图、Incident 列表
- [ ] 1 个品牌状态页
- [ ] Stripe Pro 订阅（**Founding Price $1/mo** + 标准 Price $12/mo 双轨）
- [ ] **Founding Member 基础设施**：`organizations.founding_member` 字段、徽章 UI、Stripe metadata
- [ ] SSL Checker 工具页
- [ ] 90 天数据保留（ClickHouse + 降采样）
- [ ] **无障碍基线**：WCAG 2.1 AA 核心流程、axe-core CI

**明确不做（MVP 排除）**：

- SMS、PagerDuty、DNS 监控、API JSON、2FA、Terraform、移动 App
- 团队邀请与多成员协作（Phase 2 Team 套餐）
- ⌘K 命令面板、自定义表格列

### G.1.1 早期获客定价阶段（Phase 1 同步启动）

| 里程碑 | 时间 | 交付 |
|--------|------|------|
| **Launch Week** | MVP 上线 | Founding Member 计划开启；着陆页 + `/pricing` 1 折价上线 |
| **Month 1–3** | 验证期 | 目标 500 Founding 付费；免费→Founding 转化 ≥ 8% |
| **Month 3–6** | 增长期 | 目标 2,000 Founding；SEO 工具页 + UptimeRobot 对比页引流 |
| **Month 6–12** | 规模期 | 目标 5,000 Founding 或 MRR $30k → 评估 Sunset |
| **Sunset** | 达标后 | 新用户恢复标准价；Founding Member 永久保留 1 折 |

```mermaid
gantt
    title 早期获客定价阶段
    dateFormat YYYY-MM
    section Founding
    1折计划开启           :2026-06, 12M
    名额招募 5000 人      :2026-06, 12M
    section Sunset
    评估结束 1 折新招募   :milestone, 2027-06, 0d
```

### G.2 Phase 2（+8 周）

- **Team 套餐与完整 RBAC**：成员邀请、角色分配、Org Switcher、审计日志
- **账户安全增强**：2FA TOTP、Session 管理 UI、Magic Link 登录
- **UI polish Phase 2**：⌘K 命令面板、Monitor 详情 Drawer、批量操作、Onboarding 优化
- Team 套餐、Slack/Discord、60s/30s 间隔、5+ 区域
- 维护窗口、SLA PDF 报告、p95 异常检测
- 自定义域状态页、Discord 社区机器人
- API Keys 管理 UI、通知偏好页

### G.3 Phase 3（+12 周）

- Business：SMS、PagerDuty、SSO
- API JSON 监控、Heartbeat、Terraform Provider
- 关联异常、高级白标、SOC2 准备
- 可选：轻量移动 Web PWA

```mermaid
gantt
    title 产品路线图
    dateFormat YYYY-MM
    section Phase1
    MVP Core           :2026-06, 12w
    section Phase2
    Team and Alerts    :2026-09, 8w
    section Phase3
    Enterprise         :2026-11, 12w
```

---

## H. 指标与成功标准

### H.1 North Star Metric

**每周活跃监控数（WAM）**：过去 7 天至少收到 1 次成功检查的监控总数。  
理由：直接反映产品核心价值交付。

### H.2 激活与留存

| 指标 | 定义 | MVP 目标（90 天） |
|------|------|-------------------|
| 注册 → 首个监控 | 24h 内创建 | ≥ 45% |
| 激活 | 首个监控 + 验证邮箱 + 查看仪表盘 | ≥ 35% |
| D7 留存 | 第 7 天仍有活跃监控 | ≥ 25% |
| D30 留存 | 第 30 天仍登录 | ≥ 15% |

### H.3 转化与收入

| 指标 | 目标 |
|------|------|
| 免费 → 付费转化率 | **8–12%**（Founding 期，6 个月内）；Sunset 后恢复 4–6% |
| 试用 → 付费（若启用 Team 试用） | 25% |
| MRR | MVP+90d: **$3k**（Founding 低 ARPU）；12 月: **$30k**（含 Sunset 后标准价 uplift） |
| ARPU | Founding 期 Pro ~$1–4；Sunset 后 Pro ~$12, Team ~$39 |
| **Founding Member 数量** | 90 天内 ≥ 1,000；12 月内 ≤ 5,000（锁价 cohort） |
| Churn（月度） | < 5% logo churn |

### H.4 增长与 SEO

| 指标 | 目标 |
|------|------|
| 有机注册占比 | 6 个月内 ≥ 40% |
| 工具页 → 注册 | SSL Checker ≥ 8% |
| 状态页 referral 注册 | 每月 ≥ 50 |
| CAC（付费渠道） | < 3 个月 LTV 回收 |

### H.5 平台质量

| 指标 | 目标 |
|------|------|
| 误报率（用户标记） | < 2% |
| 告警投递成功率 | > 99.5% |
| NPS | ≥ 40 |

---

## 实施优先级总结

| 周次 | 交付物 |
|------|--------|
| 1–2 | 架构脚手架、设计系统（shadcn/ui + 主题 Token）、Auth、Landing Page 骨架 |
| 3–4 | Monitor CRUD、PostgreSQL RBAC 表、Monitors 列表/创建 Wizard UI |
| 5–6 | 探针 Agent v1、调度器、CheckResult 写入 ClickHouse |
| 7–8 | 告警引擎、Dashboard 图表、Incident 状态机、Settings 页（Profile/Security） |
| 9–10 | 状态页、Stripe（**Founding + 标准双 Price**）、SSL 工具、Landing（**Founding CTA + 名额计数器**）、响应式 Mobile |
| 11–12 | 多区域聚合、降采样、Onboarding 优化、无障碍测试、Beta 与 Product Hunt |

---

## 文档结论

PulseWatch 定位在 UptimeRobot 商用限制与 Better Stack 复杂度之间的**甜蜜点**——对开发者友好的免费层、可预测定价、内置趋势与异常洞察，并以 SEO 工具矩阵驱动可持续获客。早期通过 **Founding Member 1 折计划**（Pro $1/月终身锁价）快速获取种子用户，Sunset 后恢复标准价提升 LTV。

技术方案采用 **PostgreSQL + ClickHouse + Redis + 分布式 Go 探针**，可在 8–12 周内交付可收费的 MVP，并为 Team/Business 能力预留清晰扩展路径。

---

## 相关文档

- [产品需求文档（PRD）](PRD.md)
- [UI/UX 设计规范](UI-UX-DESIGN.md)
- [用户与权限管理](USER-MANAGEMENT.md)
- [技术设计规格书](TECHNICAL-DESIGN.md)
- [定价与增长策略](PRICING-AND-GROWTH.md)
