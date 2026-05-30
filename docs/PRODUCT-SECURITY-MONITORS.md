# PulseWatch — 安全与完整性监控（Phase 6）

**文档版本**：v1.0  
**日期**：2026-05-30  
**关联**：[PRD §C.2](PRD.md) | [ISSUES Phase 6](ISSUES.md) | [IMPLEMENTATION-ROADMAP §Phase 6](IMPLEMENTATION-ROADMAP.md) | [PRODUCT-ROADMAP](PRODUCT-ROADMAP.md)

本文档规划 **SSL 证书过期**、**DNS 劫持/记录漂移**、**网页篡改与违规内容** 三类能力，并对照当前代码库标注已实现与缺口。

---

## 1. 现有能力 vs 缺口（代码库审计）

| 能力域 | 代码/产品现状 | 缺口（相对目标） |
|--------|---------------|------------------|
| **SSL 到期** | 监控类型 `ssl`（`checks.go` → `executeHTTPMonitor` + `sslMetaFromTimingsRequest`）；`http`/`keyword` 检测也会附带 TLS 元数据；`scheduler`/`probe_dispatch` 在 `sslDaysLeft ≤ 30` 时 `NotifySSLWarning`；用户 `notify_ssl`；公开工具 `GET /api/v1/public/ssl-check`；模板 `ssl-expiry` | 无证书链/中间 CA 校验；无可配置阈值（仅硬编码 30 天）；无 30/14/7/1 分级事件；`ssl_warning` 未在告警规则 UI 中单独配置；无 SAN/issuer 变更检测 |
| **DNS** | 类型 `dns`：`runDNSCheck` 支持 A/AAAA/CNAME/MX；`config.recordType`、`config.expectedValue` 静态匹配 | **非劫持检测**：不保存基线、不与上次 `check_results.metadata` 比对；无多解析器交叉验证；新建监控 UI 无 DNS 专用配置面板 |
| **域名到期** | 类型 `domain`：RDAP `runDomainCheck`（与 SSL/DNS 劫持不同产品叙事） | UI 类型选择器未暴露 `domain`（API 已支持） |
| **关键词** | 类型 `keyword`：响应体包含/不包含字符串 | 非页面指纹；易被动态广告/时间戳误报 |
| **截图** | `ScreenshotService`：HTTP/keyword **DOWN** 时取证 PNG → `check_artifacts` | 非篡改基线；无 UP 时周期性快照对比 |
| **篡改/涉黄涉赌** | **无** `tamper`/`content`/`fingerprint` 类型；无 body hash、DOM 选择器、diff %、内容审核 API | 全量 Phase 6 新建 |

### 1.1 关键代码位置

| 层 | 路径 |
|----|------|
| 检测入口 | `apps/api/internal/services/checks.go` — `RunCheck` switch |
| SSL 元数据 | `apps/api/internal/services/http_chain.go` — `sslMetaFromTimingsRequest` |
| DNS 检测 | `apps/api/internal/services/checks.go` — `runDNSCheck` |
| 域名 RDAP | `apps/api/internal/services/domain.go` |
| SSL 告警 | `apps/api/internal/services/alerts.go` — `NotifySSLWarning`；`scheduler.go` / `probe_dispatch.go` |
| 公开 SSL 工具 | `apps/api/internal/handlers/tools.go` — `SSLCheck` |
| 合法监控类型 | `apps/api/internal/handlers/monitors.go` — `validTypes` |
| 监控模板 | `apps/web/src/lib/monitor-templates.ts` |
| 新建监控 UI | `apps/web/src/app/[locale]/(app)/monitors/new/page.tsx`（含 `ssl`、`dns`，缺 `domain`/`pagespeed`/`tamper`） |
| HTTP 高级配置 | `apps/web/src/components/monitor-http-config.tsx`（仅 `http`/`keyword`/`ssl`） |

---

## 2. 功能规格表

### 2.1 SSL 证书过期监测

| 维度 | 说明 |
|------|------|
| **User value** | 在证书过期前收到可行动告警，避免 HTTPS 中断与 SEO/信任损失 |
| **MVP scope（P6-1）** | 专用 `ssl` 监控：可配置 `warnDays`（默认 30）；告警事件 `ssl_warning` 在 30/14/7/1 天分级（去重）；`check_results.metadata` 持久化 `sslDaysLeft`、`sslExpiresAt`、`issuer`、`tlsVersion`；尊重 `users.notify_ssl` |
| **当前 vs MVP** | **已有**：TLS 握手取到期日 + 30 天单次告警。**待做**：分级阈值、per-monitor 配置、链完整性（可选 Pro+）、告警规则显式订阅 `ssl_warning` |
| **Detection approach** | 探针 `tls.Dial` / HTTP `resp.TLS`（与现网一致）；不存私钥；可选二次验证：公开 `ssl-check` 同源逻辑 |
| **Alert events** | `ssl_warning`（已有）；扩展 `ssl_critical`（≤7 天，可选）；DOWN 当已过期（`IsUp: false`） |
| **Priority** | **P6-1** |

### 2.2 DNS 劫持 / 记录漂移监测

| 维度 | 说明 |
|------|------|
| **User value** | 发现 DNS 被篡改、劫持或运维误改，降低钓鱼与流量劫持风险 |
| **MVP scope（P6-2）** | 扩展 `dns` 监控：`baselineMode: auto|manual`；首次成功检查写入基线（规范化 record set 排序后 hash）；后续每次比对 A/AAAA/CNAME/MX；变更 → `dns_change` 事件 + Incident；可选 `trustedResolvers: ["1.1.1.1","8.8.8.8"]` 交叉确认 |
| **当前 vs MVP** | **已有**：单次 lookup + 可选 `expectedValue` 静态断言。**待做**：历史基线、diff 详情、劫持语义告警、多解析器 |
| **Detection approach** | `net.Resolver` 或自定义 Dial 到指定 DNS；基线存 `monitors.config.dnsBaseline` 与最近 `check_results.metadata.records`；变更时 metadata 含 `previous`/`current`/`recordType` |
| **Alert events** | `dns_change`（新）；保留 DOWN 当解析失败 |
| **Priority** | **P6-2** |

### 2.3 网页篡改 / 违规内容监测

| 维度 | 说明 |
|------|------|
| **User value** | 发现挂马、黑页、涉黄涉赌违规插入、重大版式变更（非计划发布） |
| **MVP scope（P6-3）** | 新类型 `tamper`（或 `content_integrity`）：HTTP GET 规范化 body（去空白/注释可选）→ SHA-256 fingerprint；与基线比 diff %；超 `changeThresholdPercent` → `tamper_major_change`；可选 CSS 选择器列表只 hash 关键区域 |
| **P6-4（合规内容）** | 本地 **keyword blocklist**（涉黄涉赌等，用户可编辑）；命中 → `tamper_policy_violation`；**不做** MVP 强制第三方 ML |
| **Future** | 可选外部审核 API（见 §4）；DOM 截图 diff；Playwright 渲染后 hash |
| **Detection approach** | 基线：创建时或首次 UP 时 `captureBaseline: true`；metadata：`bodyHash`、`baselineHash`、`diffPercent`、`matchedKeywords[]`；last-good 快照元数据（非必须存全文，可存 hash + 前 2KB snippet） |
| **Alert events** | `tamper_major_change`、`tamper_policy_violation`；可选 `tamper_recovered` |
| **Priority** | **P6-3**（完整性）→ **P6-4**（策略关键词）→ **P6-5**（UI） |

---

## 3. 建议实施顺序

| 顺序 | ID | 理由 |
|------|-----|------|
| 1 | **P6-1** SSL 分级 | 复用现有 `ssl` 类型与告警管道，改动面小、用户价值明确 |
| 2 | **P6-2** DNS 基线 | 已有 `dns` 类型与 metadata 存储模式，无需新 monitor enum |
| 3 | **P6-5** 安全监控 UI | 暴露 DNS/SSL/domain 配置；为 tamper 预留表单项 |
| 4 | **P6-3** Tamper fingerprint | 新类型 + 存储约定，依赖 UI 与告警事件扩展 |
| 5 | **P6-4** 内容策略 + 合规 | 依赖 tamper 管道；需法务与用户同意文案 |

---

## 4. 内容审核合规说明（涉黄涉赌等）

PulseWatch **不**在 MVP 中默认将页面全文发送至第三方审核服务。若启用 P6-4 或未来 ML/API：

| 主题 | 建议 |
|------|------|
| **法律与隐私** | 告知用户检测会获取并处理页面文本；跨境传输需符合所在地数据出境规定；日志保留策略写入隐私政策 |
| **用户同意** | 创建 `tamper` 监控时勾选「内容安全扫描」；企业客户可签署 DPA |
| **误报处理** | 规则引擎优先（blocklist + 白名单 URL 路径）；告警详情展示匹配片段（截断）；一键「确认误报」抑制 7 天 |
| **技术路线** | **默认**：本地规则引擎（关键词、正则、可选简体敏感词库）。**可选**：阿里云/腾讯云内容安全、Google Cloud Vision SafeSearch 等 — 由客户自带 API Key，PulseWatch 仅代理调用 |
| **未成年人/赌博** | 仅提供技术检测能力，不托管违法内容；违规告警供网站运营者自查 |

---

## 5. UI 规划（仅设计，本阶段不实现）

### 5.1 监控类型选择器（`/monitors/new`、`/monitors/[id]/edit`）

| 类型 | 标签（i18n key 建议） | 配置区块 |
|------|---------------------|----------|
| `ssl` | 已有 `typeSsl` | 到期预警天数、检查 URL、HTTP 高级（可选） |
| `dns` | 已有 | 记录类型、基线模式、期望记录（手动）、受信解析器 |
| `domain` | 新增 `typeDomain` | `warnDays`（与 SSL 类似叙事） |
| `tamper` | `typeTamper` | URL、基线捕获按钮、sensitivity %、类别 toggles：major change / gambling / adult |

### 5.2 Tamper 配置面板（新组件 `monitor-tamper-config.tsx`）

- **Baseline**：「立即捕获基线」「重新捕获」（调用 `POST /monitors/:id/baseline` 规划端点）
- **Sensitivity**：滑块 1–50% diff 触发 major change
- **Categories**：checkbox — 重大变更 / 赌博关键词 / 成人内容关键词（后两者启用时显示合规提示）
- **详情页**：最近 fingerprint、diff %、匹配关键词列表、与 last-good metadata 对比

### 5.3 告警与设置

- Settings → 通知：已有 `notifySsl`；扩展 `notifyDnsChange`、`notifyTamper`
- 告警规则 `event_type` 下拉增加：`ssl_warning`、`dns_change`、`tamper_major_change`、`tamper_policy_violation`

---

## 6. 数据与 API 约定（规划）

- 配置一律写入 `monitors.config`（JSONB），**不新增列**（与 MON-HTTP-01 一致）
- `check_results.metadata` 示例：
  - SSL：`sslDaysLeft`, `sslExpiresAt`, `issuer`, `tlsVersion`
  - DNS：`records`, `recordType`, `baselineHash`, `changed: true`
  - Tamper：`bodyHash`, `baselineHash`, `diffPercent`, `matchedKeywords`, `lastGoodAt`

规划中的新告警类型需在 `alert_rules.event_type` 与 `alerts.go` 路由中登记（参考现有 `ssl_warning`）。

---

## 7. 参考 PRD 原文

PRD §C.2 将 DNS 记为「记录变化」、SSL 为「到期天数、链完整性」；§C.6 SSL 分级 30/14/7/1。本 Phase 6 文档将 PRD 愿景落实为可验收 backlog（见 ISSUES / IMPLEMENTATION-ROADMAP）。

---

*维护：每完成 P6-x 更新 ISSUES 与路线图验收列。*
