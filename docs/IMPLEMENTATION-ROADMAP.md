# PulseWatch — Phase 5 实施自动化计划

**文档版本**：v1.0  
**日期**：2026-05-30  
**用途**：按序逐项实现 → 测试 → 部署 → 验证。完整 CI 尚未覆盖全部 E2E，采用 pragmatic loop（见 §1）。

**关联**：[PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) | [pulsewatch.mdc](../.cursor/rules/pulsewatch.mdc)

---

## 1. 标准交付循环（每项 P5-x 必须执行）

| 步骤 | 命令 / 动作 |
|------|-------------|
| **1. 单元测试** | `npm run test:unit`（仓库根目录） |
| **2. API 测试** | `cd apps/api && go test ./...`；改动 services 时：`go test ./internal/services/...` |
| **3. 集成测试**（API 变更） | `npm run test:integration` |
| **4. 本地冒烟** | API：`curl -s http://localhost:8080/health`；Web：`npm run dev -w apps/web` |
| **5. 部署** | API：`cd deploy && node redeploy-api.js`；Web：`cd deploy && node redeploy-web.js`；两者都改则先 API 后 Web |
| **6. 生产验证** | `curl -s http://YOUR_SERVER_IP/health` → `status: ok`；`http://YOUR_SERVER_IP/en` → 200；针对变更页面/端点 curl 或浏览器 |
| **7. 提交** | 用户明确要求时 `git commit`；默认文档/功能完成后由 Agent 按任务说明决定 |
| **8. 推送** | 用户明确要求或项目规则要求时 `git push origin main` |

**Cursor Agent 单任务提示词模板**：

```text
Implement P5-N from docs/IMPLEMENTATION-ROADMAP.md only.
Run test loop §1, deploy per scope, verify production URLs, report acceptance criteria.
Do not start P5-N+1 in the same task.
```

---

## 2. Backlog（有序）

### P5-1 — 真分布式探针 Worker（MVP）

| 项 | 内容 |
|----|------|
| **Scope** | 独立 `probe-worker` 进程；API 通过 Redis/HTTP 分发检测任务；至少 2 地理区域（如 `us-east`、`ap-southeast`）；Scheduler 聚合真实区域结果 |
| **Key files** | `apps/api/internal/services/scheduler.go`, 新建 `apps/probe/` 或 `deploy/probe-worker.js`, `apps/api/internal/config/config.go` |
| **Acceptance** | 同一监控在 2 区域返回不同 `probe_region` 与可区分的 `response_ms`；N-of-M 仍生效；DOWN 告警只发一次 |
| **Test** | `go test ./internal/services/...`；手动：创建监控选 2 区域，查 `check_results.region` |
| **Deploy** | `redeploy-api.js` + probe worker systemd/nginx（新脚本可放 `deploy/`） |
| **Priority** | P0 |

---

### P5-2 — 移动端底栏导航

| 项 | 内容 |
|----|------|
| **Scope** | `dashboard-shell.tsx` 增加 `<md` 底部 Tab（Dashboard / Monitors / Incidents / Status / Settings）；Touch target ≥44px |
| **Key files** | `apps/web/src/components/dashboard-shell.tsx`, `apps/web/messages/en.json`, `zh.json` |
| **Acceptance** | 375px 宽度可完成：登录 → 看 Dashboard → 进 Monitors → 看 Incident；axe 无 critical |
| **Test** | `npm run test:unit`；浏览器 375px 手测 |
| **Deploy** | `redeploy-web.js` |
| **Priority** | P0 |

---

### P5-3 — 国内 IM 告警部署（钉钉/飞书/企微）

| 项 | 内容 |
|----|------|
| **Scope** | 确保 migration `008_cn_alert_channels.sql` 在生产执行；端到端测试三种渠道；文档 `.env.example` 无密钥 |
| **Key files** | `apps/api/internal/services/alerts_cn.go`, `alerts.go`, `008_cn_alert_channels.sql`, `alert-integrations.tsx` |
| **Acceptance** | Settings → 集成 → 创建钉钉/飞书/企微渠道 → Test → 监控 DOWN 收到消息；加签路径可用 |
| **Test** | `go test ./internal/services/... -run CN`；`POST .../alert-channels/:id/test` |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P0（国内） |

---

### P5-4 — On-Call 升级 + 事件指挥台 UI

| 项 | 内容 |
|----|------|
| **Scope** | Ack API + 15min 升级至 L2；`/on-call` 顶级页；`/incidents/[id]` 指派成员、状态机、同步状态页 Toggle |
| **Key files** | `oncall.go`, `handlers/oncall.go`, `handlers/incidents.go`, 新建 `apps/web/src/app/.../on-call/page.tsx`, `incidents/[id]/page.tsx` |
| **Acceptance** | 排班主值班未 Ack 15min 后通知 L2；事件页可改 workflow、指派、写 postMortem |
| **Test** | `go test ./internal/handlers/...`；集成测试 incidents |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P1 |

---

### P5-5 — 故障截图 + Monitor 取证 Tab

| 项 | 内容 |
|----|------|
| **Scope** | DOWN 时 headless Chromium 截图 → MinIO/S3；`artifacts` 表；监控详情检测记录展开 Tab |
| **Key files** | 新建 `apps/api/internal/services/screenshot.go`, `checks.go`, `monitors/[id]/page.tsx`, migration |
| **Acceptance** | HTTP DOWN 可在 UI 查看 PNG + 现有 body snippet；保留期按套餐 |
| **Test** | `go test ./internal/services/...`；模拟 DOWN 检查 artifact URL |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` + 对象存储 env |
| **Priority** | P1 |

---

### P5-6 — 状态页增强（公告 + uptime 历史）

| 项 | 内容 |
|----|------|
| **Scope** | 手动发布公告 CRUD；公开页 90 天 uptime 条；维护窗口 → 状态页横幅 |
| **Key files** | `handlers/status_pages.go`, `status/[slug]/page.tsx`, `status-pages/page.tsx` |
| **Acceptance** | 编辑页可发布公告；公开页展示；维护期间显示 Scheduled Maintenance |
| **Test** | `go test ./internal/handlers/...`；curl public status API |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P1 |

---

### P5-7 — Twilio 语音告警

| 项 | 内容 |
|----|------|
| **Scope** | `alert_channels.type = voice`；TTS 朗读监控名；Business 套餐门控 |
| **Key files** | `twilio.go`, `alerts.go`, `alert-integrations.tsx` |
| **Acceptance** | Business org 配置 voice 渠道，DOWN 时手机响铃；15min 限速 |
| **Test** | `go test ./internal/services/...`；Test Channel 按钮 |
| **Deploy** | `redeploy-api.js` + Twilio env |
| **Priority** | P1 |

---

### P5-8 — Monitors 列表性能 + 批量操作

| 项 | 内容 |
|----|------|
| **Scope** | `@tanstack/react-virtual` 或等效；多选 + 批量 pause/delete |
| **Key files** | `monitors/page.tsx`, 可选 `PATCH /monitors/batch` |
| **Acceptance** | 200 行列表滚动流畅；批量暂停 10 个监控 <3s |
| **Test** | `npm run test:unit`；Chrome Performance 快照 |
| **Deploy** | `redeploy-web.js`（若仅 UI） |
| **Priority** | P1 |

---

### P5-9 — 套餐配额硬门控

| 项 | 内容 |
|----|------|
| **Scope** | 按 `planTier` 限制：最短间隔、区域数、SMS 月用量、监控数；触顶升级弹窗 |
| **Key files** | `handlers/monitors.go`, `scheduler.go`, `billing.go`, `upgrade-modal` 组件 |
| **Acceptance** | Free 无法设 1min；Business 可用 30s；SMS 超额拒绝并提示 |
| **Test** | `go test ./internal/handlers/...` |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P1 |

---

### P5-10 — Terraform Provider v0.1

| 项 | 内容 |
|----|------|
| **Scope** | `integrations/terraform/provider` 最小 resource：`pulsewatch_monitor`；文档注册示例 |
| **Key files** | 新建 provider Go module；`integrations/terraform/README.md` |
| **Acceptance** | `terraform apply` 创建监控并在 UI 可见；`terraform destroy` 删除 |
| **Test** | provider 单元测试 + 手工 apply |
| **Deploy** | 仅文档/provider 发布时可跳过 prod；API 无变更则不必 redeploy |
| **Priority** | P1 |

---

### P5-11 — Core Web Vitals 扩展

| 项 | 内容 |
|----|------|
| **Scope** | Pagespeed monitor 增加 LCP/FCP 采集（headless）；Dashboard 可选展示 |
| **Key files** | `checks.go`, `pagespeed` config, monitor templates |
| **Acceptance** | Team+ 监控类型 pagespeed 返回 LCP ms；超阈值 DOWN |
| **Test** | `go test ./internal/services/...` |
| **Deploy** | `redeploy-api.js` |
| **Priority** | P2 |

---

### P5-12 — ⌘K 命令面板

| 项 | 内容 |
|----|------|
| **Scope** | `cmdk` 组件；跳转 Dashboard/Monitors/Incidents/Settings；搜索监控名 |
| **Key files** | 新建 `command-palette.tsx`, `dashboard-shell.tsx` |
| **Acceptance** | ⌘K/Ctrl+K 打开；输入监控名 Enter 跳转详情 |
| **Test** | `npm run test:unit`；键盘手测 |
| **Deploy** | `redeploy-web.js` |
| **Priority** | P2 |

---

### P5-13 — SSO OIDC（Business）

| 项 | 内容 |
|----|------|
| **Scope** | 组织级 OIDC IdP 配置；仅 Business；与 Email 登录并存 |
| **Key files** | `handlers/auth.go`, migration `org_sso`, settings UI |
| **Acceptance** | 配置 Okta/Google Workspace 后成员可用 SSO 登录 |
| **Test** | 集成测试 mock OIDC |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P2 |

---

### P5-14 — Opsgenie 集成

| 项 | 内容 |
|----|------|
| **Scope** | `alert_channels.type = opsgenie`；API Key → 创建 Alert |
| **Key files** | `alerts.go`, `alert-integrations.tsx` |
| **Acceptance** | Test Channel 在 Opsgenie 创建告警 |
| **Test** | `go test ./internal/services/...` |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P2 |

---

### P5-15 — 竞品对比落地页

| 项 | 内容 |
|----|------|
| **Scope** | `/compare/uptimerobot`、`/compare/better-stack`；功能表 + Founding CTA；en/zh |
| **Key files** | `apps/web/src/app/[locale]/compare/...`, `messages/*.json`, `pricing/page.tsx` 互链 |
| **Acceptance** | Lighthouse Performance ≥85；CTA 链到 register；pricing 页有对比锚点 |
| **Test** | `npm run test:unit`；Lighthouse CI 可选 |
| **Deploy** | `redeploy-web.js` |
| **Priority** | P1（增长） |

---

## Phase 6 — 安全与完整性监控

**产品规格**：[PRODUCT-SECURITY-MONITORS.md](PRODUCT-SECURITY-MONITORS.md)  
**交付循环**：沿用 §1（`npm run test:unit` → `go test ./internal/services/...` → deploy API/Web → 生产验证）。

### P6-1 — SSL 到期分级与可配置阈值

| 项 | 内容 |
|----|------|
| **Scope** | `config.warnDays`（默认 30）；在 30/14/7/1 天触发 `ssl_warning`（同监控去重）；`check_results.metadata` 写入 issuer/tlsVersion；`ssl` 类型过期时 `IsUp: false` |
| **Key files** | `http_chain.go`, `scheduler.go`, `probe_dispatch.go`, `alerts.go`, `email.go`, `monitors/new` + `edit`（warnDays 字段）, `messages/en.json`, `zh.json` |
| **Acceptance** | 创建 `ssl` 监控；模拟临近到期证书（测试 stub 或 staging 主机）；收到分级邮件/Webhook；详情页 metadata 可见天数 |
| **Test** | `go test ./internal/services/... -run SSL`；`npm run test:unit` |
| **Deploy** | `redeploy-api.js`（+ web 若 UI） |
| **Priority** | P0 |

---

### P6-2 — DNS 基线与劫持/漂移检测

| 项 | 内容 |
|----|------|
| **Scope** | `runDNSCheck` 比对上次成功 records；变更发 `dns_change`；`config.baselineMode`、`trustedResolvers`；metadata `previous`/`current` |
| **Key files** | `checks.go`, `scheduler.go`, `alerts.go`, migration 可选 `alert_rules` 文档化 event_type, `monitor-dns-config.tsx`（新建） |
| **Acceptance** | 创建 DNS 监控记录基线；修改 public DNS 或 mock 后下一次检查触发 `dns_change` Incident；多解析器一致时才告警（配置开启时） |
| **Test** | `go test ./internal/services/... -run DNS` |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P0 |

---

### P6-3 — Tamper 监控（指纹 + 重大变更）

| 项 | 内容 |
|----|------|
| **Scope** | 新 `monitor_type` `tamper`（migration）；规范化 body SHA-256；`diffPercent` vs `changeThresholdPercent`；事件 `tamper_major_change`；`POST /monitors/:id/baseline` 重捕获 |
| **Key files** | `checks.go`, `migrations/010_tamper.sql`, `monitors.go`, `alerts.go`, `monitor-tamper-config.tsx`, `monitors/new`, `monitors/[id]/edit` |
| **Acceptance** | 基线捕获后修改页面 > 阈值触发告警；metadata 含 hash/diff；误报可 Ack |
| **Test** | `go test ./internal/services/... -run Tamper` |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P1 |

---

### P6-4 — 内容策略与合规（blocklist）

| 项 | 内容 |
|----|------|
| **Scope** | `config.policyCategories`（gambling/adult）；org 级或监控级 blocklist；命中 `tamper_policy_violation`；创建监控合规 checkbox + 隐私链接 |
| **Key files** | `checks.go`, `PRODUCT-SECURITY-MONITORS.md` §4, settings/legal 文案, `messages/*.json` |
| **Acceptance** | 测试页含 blocklist 词触发告警；UI 显示匹配片段（截断）；用户可标记误报抑制 |
| **Test** | 单元测试 blocklist 匹配；无真实第三方 API 密钥入库 |
| **Deploy** | `redeploy-api.js` + `redeploy-web.js` |
| **Priority** | P1 |

---

### P6-5 — 安全监控 UI 与告警事件

| 项 | 内容 |
|----|------|
| **Scope** | 类型选择器补全 `domain`/`pagespeed`/`tamper`；DNS/SSL/Tamper 专用配置组件；告警规则 event 下拉扩展 |
| **Key files** | `monitors/new/page.tsx`, `monitors/[id]/edit/page.tsx`, `monitor-dns-config.tsx`, `monitor-tamper-config.tsx`, `alert-rules` UI, i18n |
| **Acceptance** | 375px 可创建 DNS+SSL 监控；Tamper 配置 sensitivity 与 categories；Settings 通知 toggles |
| **Test** | `npm run test:unit`；浏览器 `/zh/monitors/new` |
| **Deploy** | `redeploy-web.js`（依赖 P6-1~4 API 时先 API） |
| **Priority** | P1 |

---

### Phase 6 建议节奏

| 周次 | 任务 |
|------|------|
| W1 | P6-1 |
| W2 | P6-2 + P6-5（DNS 部分） |
| W3–4 | P6-3 |
| W5 | P6-4 + P6-5（Tamper UI） |

---

## 3. 建议自动化节奏

| 周次 | 任务 | 并行？ |
|------|------|--------|
| W1 | P5-3（IM 部署）+ P5-2（移动 IA） | 可并行（API/Web 分工） |
| W2 | P5-1（探针 MVP） | 独占（基础设施） |
| W3 | P5-9（配额门控） | 依赖 P5-1 区域定义 |
| W4–5 | P5-4 + P5-6 | 部分并行 |
| W6 | P5-5（截图） | 需对象存储 |
| W7 | P5-7 + P5-8 | 可并行 |
| W8–9 | P5-10 + P5-15 | 可并行 |
| W10+ | P5-11 ~ P5-14 | 按优先级插队 |

---

## 4. 生产验证清单（每次部署后）

```bash
curl -s http://YOUR_SERVER_IP/health
curl -s -o /dev/null -w "%{http_code}" http://YOUR_SERVER_IP/en
# 登录后（需 token）：
# curl -H "Authorization: Bearer $TOKEN" http://YOUR_SERVER_IP/api/v1/me
```

| 功能域 | 验证 URL / 动作 |
|--------|-----------------|
| 监控 | `/en/monitors/new` 创建 HTTP 监控 |
| 告警 | Settings → Integrations → Test Channel |
| 事件 | 手动 pause 监控或等 DOWN → `/en/incidents` |
| 状态页 | `/status/{slug}` 公开访问 |
| 国内 IM | 钉钉/飞书 test webhook |

---

## 5. Cursor Automation（可选）

若 Cursor 账户为 **storage-eligible** 模式，可为每项 P5-x 创建 Automation：Trigger = 手动或 PR merge；Actions = 运行上述测试循环 + deploy 脚本。当前环境未验证 storage 模式，**暂不生成 prefill URL**；可在本地用 §1 Agent 模板逐条驱动。

---

*完成项请在 [ISSUES.md](ISSUES.md) Phase 5 表中标记 ✅ 并注明部署日期。*
