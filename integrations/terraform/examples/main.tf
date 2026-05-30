# PulseWatch Terraform example (null_resource + curl)
# See ../README.md for provider client smoke test.

terraform {
  required_version = ">= 1.5"
}

variable "pulsewatch_api_key" {
  type      = string
  sensitive = true
}

variable "pulsewatch_org_id" {
  type = string
}

variable "pulsewatch_api_url" {
  type    = string
  default = "http://49.234.112.108"
}

resource "null_resource" "api_health_monitor" {
  triggers = {
    name = "API Health"
    url  = "https://example.com/health"
  }

  provisioner "local-exec" {
    command = <<-EOT
      curl -sf -X POST "${var.pulsewatch_api_url}/api/v1/orgs/${var.pulsewatch_org_id}/monitors" \
        -H "Authorization: Bearer ${var.pulsewatch_api_key}" \
        -H "Content-Type: application/json" \
        -d '{"name":"API Health","type":"http","targetUrl":"https://example.com/health","intervalSeconds":300,"regions":["us-east"]}'
    EOT
  }
}
