# HTTP 监控请求配置

> 需求编号：**MON-HTTP-01**（HTTP 方法 / 请求体 / 多步请求链）

## 背景

用户需要监控非简单 GET 的 API 端点，以及需要先登录/取 token 再探测的业务链路。

## 功能范围

### 1. 单次 HTTP 请求

适用于 `http`、`keyword`、`ssl` 类型监控，配置存储在 `monitors.config`（JSONB）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | string | GET / POST / PUT / PATCH / DELETE / HEAD，默认 GET |
| `body` | string | POST/PUT/PATCH 请求体，支持 JSON 文本 |
| `headers` | object | 自定义请求头 |
| `expectedStatus` | number | 单个期望 HTTP 状态码（兼容旧配置） |
| `expectedStatuses` | number[] | 多个期望状态码，**匹配任一即成功**，默认 `[200]` |
| `keyword` | string | keyword 类型：响应体关键词 |
| `keywordMustContain` | boolean | 是否必须包含关键词 |
| `timeout` | number | 超时秒数，默认 30 |

### 2. 多步请求链（Request Chain）

当 `config.steps` 非空时，忽略顶层 `method/body`，按顺序执行最多 **5** 步。

每步字段：

| 字段 | 说明 |
|------|------|
| `name` | 步骤名称（可选，用于错误信息） |
| `url` | 请求 URL；**第 1 步可留空**，使用监控的 `targetUrl` |
| `method` | 请求方法 |
| `body` | 请求体，支持 `{{var}}` 模板 |
| `headers` | 请求头，支持 `{{var}}` |
| `expectedStatus` | 本步单个期望状态码（兼容） |
| `expectedStatuses` | 本步多个期望状态码，匹配任一即成功 |
| `extract` | 从本步响应提取变量 |

提取规则 `extract[]`：

| 字段 | 说明 |
|------|------|
| `var` | 变量名，供后续步骤通过 `{{var}}` 引用 |
| `from` | `json` / `regex` / `header` |
| `path` | JSON 点路径（如 `data.token`）或 Header 名 |
| `pattern` | 正则表达式，**第 1 个捕获组**为提取值 |

### 3. 示例

**POST JSON：**

```json
{
  "method": "POST",
  "body": "{\"username\":\"probe\"}",
  "headers": { "Content-Type": "application/json" },
  "expectedStatus": 201
}
```

**登录 + 带 token 探测：**

```json
{
  "steps": [
    {
      "name": "login",
      "url": "https://api.example.com/auth/login",
      "method": "POST",
      "body": "{\"user\":\"monitor\",\"pass\":\"***\"}",
      "extract": [{ "var": "token", "from": "json", "path": "accessToken" }]
    },
    {
      "name": "health",
      "url": "https://api.example.com/health",
      "method": "GET",
      "headers": { "Authorization": "Bearer {{token}}" }
    }
  ],
  "expectedStatus": 200
}
```

## UI

- 创建页 `/monitors/new`、编辑页 `/monitors/[id]/edit`
- 组件：`apps/web/src/components/monitor-http-config.tsx`
- 类型定义：`apps/web/src/lib/monitor-config.ts`

## 实现

- 执行引擎：`apps/api/internal/services/http_chain.go`
- 配置解析：`apps/api/internal/services/http_config.go`
- 调度器通过 `RunCheck()` 调用，结果写入 `check_results`

## 限制

- 请求链最多 5 步
- 单步请求体最大 64KB
- 响应体读取上限 1MB（与原有 HTTP 检查一致）
- 不支持 GraphQL 专用语法（可用 POST body 自行构造）

## 检测耗时分解（metadata.timings）

每次 HTTP 检测在 `check_results.metadata` 中记录：

| 字段 | 含义 |
|------|------|
| `dnsMs` | DNS 解析 |
| `tcpMs` | TCP 连接 |
| `tlsMs` | TLS 握手（HTTPS） |
| `ttfbMs` | 服务器响应（首字节时间 TTFB） |
| `downloadMs` | 响应体下载 |
| `totalMs` | 总耗时 |

请求链时在 `chainStepDetails[]` 中按步骤分别记录。失败时 `error_message` 与 metadata 一并展示于监控详情页。

## 验收

1. 创建 POST 监控，请求体被正确发送，状态码匹配则 UP
2. 创建 2 步请求链，第 1 步 JSON 提取 token，第 2 步 URL/Header 正确使用变量
3. 编辑页可加载并保存已有 config
4. 检测记录与响应时间正常展示
