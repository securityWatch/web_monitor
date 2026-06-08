# PulseWatch Terraform Provider (示例)

PulseWatch 提供 REST API（OpenAPI：`/api/v1/openapi.json`）。以下示例展示如何用 Terraform `http` 数据源与 `null_resource` 管理监控资源。

## 前置条件

- Terraform >= 1.5
- PulseWatch API Key（在控制台 Settings → API Keys 创建）

## 环境变量

```bash
export TF_VAR_pulsewatch_api_key="pw_xxx"
export TF_VAR_pulsewatch_org_id="your-org-uuid"
export TF_VAR_pulsewatch_api_url="https://your-domain.com"
```

## 示例：创建 HTTP 监控

```hcl
variable "pulsewatch_api_key" { type = string }
variable "pulsewatch_org_id" { type = string }
variable "pulsewatch_api_url" { default = "https://your-domain.com" }

resource "null_resource" "monitor" {
  triggers = {
    name = "API Health"
    url  = "https://api.example.com/health"
  }

  provisioner "local-exec" {
    command = <<-EOT
      curl -sf -X POST "${var.pulsewatch_api_url}/api/v1/orgs/${var.pulsewatch_org_id}/monitors" \
        -H "Authorization: Bearer ${var.pulsewatch_api_key}" \
        -H "Content-Type: application/json" \
        -d '{"name":"API Health","type":"http","targetUrl":"https://api.example.com/health","intervalSeconds":300,"regions":["us-east"]}'
    EOT
  }
}
```

## 可复制示例（推荐）

`integrations/terraform/examples/rest-monitor.tf` — `null_resource` + `curl`，可在生产 API 上直接 `terraform apply`（需 API Key 与 org UUID）。

## 正式 Provider v0.1（client MVP）

`integrations/terraform/provider/` 包含最小 API 客户端（`client.go`），支持 `CreateMonitor` / `DeleteMonitor`。

```bash
cd integrations/terraform/provider
export PULSEWATCH_API_URL=http://YOUR_SERVER_IP
export PULSEWATCH_API_KEY=pw_xxx
export PULSEWATCH_ORG_ID=your-org-uuid
go run .
```

Terraform resource 示例（配合 `terraform` CLI 本地 dev override）：

```hcl
terraform {
  required_providers {
    pulsewatch = {
      source  = "pulsewatch/pulsewatch"
      version = "0.1.0"
    }
  }
}

resource "pulsewatch_monitor" "api" {
  name             = "API Health"
  type             = "http"
  target_url       = "https://api.example.com/health"
  interval_seconds = 300
  regions          = ["us-east", "ap-southeast"]
}
```

完整 HashiCorp plugin 注册将在 v0.2 发布；当前可用 `null_resource` + `client.go` 或 OpenAPI 生成器。

## 旧版 curl 示例

## API 文档

- OpenAPI Spec: `GET /api/v1/openapi.json`
- 认证: `Authorization: Bearer <api_key>`
