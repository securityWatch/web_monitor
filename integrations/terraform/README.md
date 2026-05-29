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

## 正式 Provider

完整的 `terraform-provider-pulsewatch` 尚在规划中。当前推荐：

1. 使用 [OpenAPI Generator](https://openapi-generator.tech/) 从 `/api/v1/openapi.json` 生成客户端
2. 或使用 [RestAPI Provider](https://registry.terraform.io/providers/Mastercard/restapi/latest) 配置 CRUD 端点

## API 文档

- OpenAPI Spec: `GET /api/v1/openapi.json`
- 认证: `Authorization: Bearer <api_key>`
