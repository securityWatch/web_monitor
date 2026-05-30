# PulseWatch — 产品路线图（Phase 5+）

**文档版本**：v1.0  
**日期**：2026-05-30  
**关联**：[PRD](PRD.md) | [竞品分析 §15 差距矩阵](COMPETITOR-ANALYSIS.md#15-pulsewatch-差距矩阵phase-5-基准) | [实施自动化计划](IMPLEMENTATION-ROADMAP.md) | [ISSUES](ISSUES.md)

---

## 1. 已完成阶段摘要

| Phase | 范围 | 状态 |
|-------|------|------|
| 1 | 监控闭环、认证、Dashboard、状态页、Stripe Founding | ✅ |
| 2 | API Keys、DNS、降噪、N-of-M、模板、SSL Checker | ✅ |
| 3 | 2FA、Magic Link、审计、SLA 导出、OpenAPI | ✅ |
| 4 | SMS、Teams、域名、Pagespeed、事件流、On-Call MVP、告警合并、状态页联动 | ✅ 代码库 |
| 4+ | 钉钉/飞书/企微告警 | 🔜 migration `008`，待部署 |

---

## 2. Phase 5 主题：「可信探针 + 团队闭环 + 国内就绪」

```mermaid
flowchart LR
    subgraph P5A["P5A 信任基线（W1-3）"]
        A1[真分布式探针]
        A2[移动端底栏 IA]
        A3[国内 IM 部署]
    end
    subgraph P5B["P5B 团队闭环（W4-7）"]
        B1[On-Call Ack/升级]
        B2[事件指挥台 UI]
        B3[截图取证]
        B4[语音告警]
    end
    subgraph P5C["P5C 增长与企业（W8-12）"]
        C1[白标状态页]
        C2[Terraform Provider]
        C3[SSO OIDC]
        C4[对比落地页]
    end
    P5A --> P5B --> P5C
```

---

## 3. 差距 → 阶段映射

| 差距（见 COMPETITOR-ANALYSIS §15） | Phase |  backlog ID |
|-----------------------------------|-------|-------------|
| 真分布式多区域探针 | P5A | P5-1 |
| 移动端底栏 + 375px 可用 | P5A | P5-2 |
| 钉钉/飞书/企微上线 | P5A | P5-3 |
| On-Call Ack + 升级超时 | P5B | P5-4 |
| 故障截图 + 取证 Tab UI | P5B | P5-5 |
| 状态页公告 + 90 天 uptime | P5B | P5-6 |
| Twilio 语音告警 | P5B | P5-7 |
| 监控列表虚拟滚动 + 批量 | P5B | P5-8 |
| 套餐门控（30s/区域/SMS 配额） | P5B | P5-9 |
| Terraform Provider v0.1 | P5C | P5-10 |
| Core Web Vitals 扩展 | P5C | P5-11 |
| ⌘K 命令面板 | P5C | P5-12 |
| SSO OIDC（Business） | P5C | P5-13 |
| Opsgenie 集成 | P5C | P5-14 |
| UR/BS 对比落地页 | P5C | P5-15 |

**Phase 6（预览，未排期）**：浏览器 Playwright 合成、PDF SLA 白标、状态页 React SDK、异常 Insight 告警、SOC2、AI Post-mortem 摘要。

---

## 4. 套餐功能门控（Phase 5 目标）

| 功能 | Free | Pro | Team | Business |
|------|:----:|:---:|:----:|:--------:|
| 检测间隔 | 5 min | 1 min | 60 s | 30 s |
| 探针区域（真分布式后） | 2 | 5 | 10 | 20 |
| 钉钉/飞书/企微 | ✅ | ✅ | ✅ | ✅ |
| SMS | ❌ | ❌ | ❌ | 500/月 |
| 语音 | ❌ | ❌ | ❌ | ✅ |
| On-Call 排班 | ❌ | ❌ | 3 人 | 无限 |
| 截图保留 | ❌ | 7 天 | 30 天 | 90 天 |
| 白标状态页 | ❌ | ❌ | ❌ | ✅ |
| SSO | ❌ | ❌ | ❌ | OIDC |

---

## 5. 成功指标（Phase 5）

| 指标 | 目标 |
|------|------|
| 移动 Web 核心流程完成率 | ≥ 80%（375px） |
| 国内注册占比 | ≥ 15%（IM 渠道上线后） |
| UR 对比页 → 注册转化 | ≥ 12% |
| Team 套餐占付费用户 | ≥ 20% |
| 真探针区域 P95 检测延迟 | < 500ms（控制平面除外） |

---

## 6. 文档维护

- 每完成一项 P5-x：更新 [ISSUES.md](ISSUES.md) 状态 + [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) 验收记录  
- 每季度：复审 [COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md) 定价与功能表
