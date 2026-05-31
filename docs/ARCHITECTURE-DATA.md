# PulseWatch — 数据存储架构（内部）

**受众**：开发/运维；**不**对外展示给用户或营销页面。

> **实现说明**：PulseWatch 使用 **PostgreSQL 单库** 存储全部业务与时序数据。**不使用 ClickHouse**（早期设计文档中的 ClickHouse 方案未落地）。

---

## 存储引擎

| 组件 | 技术 | 说明 |
|------|------|------|
| 主数据库 | PostgreSQL 16 | 用户、组织、监控、事件、告警、检测历史等 |
| 时序检测数据 | PostgreSQL 分区表 `check_results` | 按月 `RANGE (checked_at)` 分区，**非**独立 TSDB |
| 缓存/队列 | 未在 MVP 强制依赖 Redis | 调度在 API 进程内完成 |
| ClickHouse | **无** | 代码与迁移中无 ClickHouse 客户端或表 |

连接配置：`DATABASE_URL`（见 `apps/api/internal/config/config.go`）。启动时 `ensurePartitions()` 自动创建当月及前后若干月的 `check_results_YYYY_MM` 分区（`apps/api/internal/database/db.go`）。

---

## 核心表

### 检测时序 — `check_results`

每次探针/调度检测写入一行：

| 列 | 说明 |
|----|------|
| `id`, `checked_at` | 复合主键（分区键为 `checked_at`） |
| `org_id`, `monitor_id` | 租户与监控归属 |
| `region` | 探针区域 |
| `status_code`, `response_ms`, `is_up` | HTTP/检测结果 |
| `error_message`, `metadata` | 失败原因与扩展 JSON（SSL 天数、链式请求等） |

写入路径：`scheduler.go`、`probe_dispatch.go` → `INSERT INTO check_results`。

读取路径：仪表盘（24h）、监控详情/统计（`parseTimeRange`：1h/24h/7d/30d）、状态页公开数据（90d）、周报（30d）。

### 监控与配置 — `monitors`

监控定义、`config` JSONB（HTTP 链、超时、关键词等）、`interval_seconds`、状态、`regions` 等。删除监控时 `ON DELETE CASCADE` 级联删除其 `check_results`。

### 事件 — `incidents` / `incident_timeline` / `incident_monitors`

故障事件生命周期、时间线、关联多监控（Phase 4）。

### 告警 — `alert_channels`, `alert_rules`, `alert_deliveries`

渠道配置、规则、投递记录。

### 用户与租户 — `users`, `organizations`, `organization_members`, `sessions`

认证、RBAC、刷新令牌会话。OAuth、`users.locale`（002）、2FA（006）等扩展表见迁移。

### 状态页 — `status_pages`, `status_page_monitors`, `status_announcements`, `status_page_subscribers`, `status_page_incidents`

公开状态页与订阅、公告、关联事件。

### 分布式探针 — `probe_runs`, `probe_tasks`（009）

探针任务队列与 worker 结果（Phase 5）。

### 截图等附件 — `check_artifacts`（009）

`storage_url` + `expires_at`；保留天数按套餐（见下）。

### 其他

`api_keys`, `maintenance_windows`, `org_invitations`, `audit_logs`, `on_call_*`, `org_sso`, `sms_usage`, `founding_counter` 等 — 见 `apps/api/internal/database/migrations/`。

---

## 数据保留（代码中的实际行为）

| 数据类型 | 保留策略 | 代码位置 |
|----------|----------|----------|
| `check_results` | **7 天原始**；更老数据 rollup 到 `check_results_rollup_5m`；**90 天**后 DROP 月分区 + 删 rollup |；数据持续写入直至手动删库/删监控级联 | 无 `DELETE FROM check_results` 定时任务 |
| 仪表盘/列表聚合 | 查询窗口默认 **24 小时** | `dashboard.go`, `monitors` 列表子查询 |
| 监控统计 API | 客户端 `range`：**1h / 24h（默认）/ 7d / 30d** | `handlers/time_range.go` |
| 状态页历史曲线 | 查询 **90 天** | `status_pages.go` |
| 周报 | **30 天** | `reports.go` |
| 检测截图 `check_artifacts` | 按套餐：**Free 无**，Pro 7d / Team 30d / Business 90d | `PlanScreenshotRetentionDays()` in `util.go` |
| 访问/刷新令牌 | Access 15min（默认）、Refresh 30d（默认） | `config.go` |
| 邮件验证/魔法链接等 token | 24h 过期 | 各 token 表 + `expires_at` |

> 路线图曾提及「90 天保留 + 降采样」（`docs/ROADMAP.md`），**当前代码未实现** check_results 自动过期；分区表便于将来按分区 `DROP` 做归档。

---

## API 与前端

- 公开 REST JSON **不**暴露 `storageEngine`、数据库类型或表名。
- 监控/检测 API 返回业务字段（`checks`, `stats`, `pagination`），无基础设施元数据。
- 营销页、FAQ、JSON-LD **不应**提及 PostgreSQL、分区表、ClickHouse 等（见 i18n 审计）。

---

## 相关文档

- 初始 DDL：`apps/api/internal/database/migrations/001_initial.sql`（文件头注明 PostgreSQL only, no ClickHouse）
- 部署：`DEPLOYMENT.md`
- 历史设计（含未落地的 ClickHouse 设想）：`docs/TECHNICAL-DESIGN.md` §E — 以本文与迁移为准
