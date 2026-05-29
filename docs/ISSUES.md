# PulseWatch 功能任务清单

> 基于竞品对标与 P0/P1 优先级拆分。完成一项勾选一项。

## P0 — 核心闭环（用户留存）

| ID | 任务 | 状态 | 验收标准 |
|----|------|------|----------|
| P0-1a | Webhook 真实 HTTP POST | ✅ | 故障触发后 webhook 收到 JSON |
| P0-1b | 告警渠道 CRUD API | ✅ | GET/POST/PATCH/DELETE alert-channels |
| P0-1c | 设置页「集成」Tab | ✅ | 配置 Webhook/Slack/Discord + 测试按钮 |
| P0-2a | 检测失败重试（3 次） | ✅ | 单次调度内重试 5s 间隔，减少误报 |
| P0-2b | 恢复通知 | ✅ | UP 时发送 recovery 告警 |
| P0-2c | 告警 event_type 精确匹配 | ✅ | down/up/all 分别生效 |
| P0-3a | status_pages 表 + API | ✅ | 创建/编辑/列表 |
| P0-3b | 公开状态页 `/status/{slug}` | ✅ | 无需登录可查看 |
| P0-3c | 状态页管理 UI | ✅ | 选择监控、发布 |
| P0-4 | Google/GitHub OAuth | ⏳ | 下一 Sprint |
| P0-5 | Slack/Discord 告警 | ✅ | Incoming Webhook 格式 |
| P0-6 | 邮件模板优化 | ✅ | HTML 模板 + 恢复/故障区分 |

## P1 — 付费转化

| ID | 任务 | 状态 |
|----|------|------|
| P1-1 | API JSON 断言（JSONPath） | ⏳ |
| P1-2 | Heartbeat / Cron 监控 | ⏳ |
| P1-3 | 维护窗口 | ⏳ |
| P1-4 | 告警延迟（DOWN 持续 N 分钟才通知） | ⏳ |
| P1-5 | Stripe Founding 付费 | ⏳ |
| P1-6 | Onboarding 3 步向导 | ⏳ |

## P2 — 团队/企业

| ID | 任务 | 状态 |
|----|------|------|
| P2-1 | 团队邀请 + RBAC UI | ⏳ |
| P2-2 | PagerDuty 集成 | ⏳ |
| P2-3 | SLA 报告导出 | ⏳ |
| P2-4 | 多区域探针 | ⏳ |

---

## 实现顺序（当前 Sprint）

1. P0-1 → P0-2 → P0-5（告警链路）
2. P0-3（状态页）
3. 部署 API + Web → 服务器验证
4. P0-4 OAuth（下一 Sprint）
5. P1 功能迭代
