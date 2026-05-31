# PulseWatch monitor via REST API (usable without HashiCorp plugin registry)
# Requires: Terraform >= 1.5, curl on PATH, API key from Settings → API Keys

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

resource "null_resource" "pulsewatch_http_monitor" {
  triggers = {
    name = "API Health (Terraform)"
    url  = "https://example.com/health"
  }

  provisioner "local-exec" {
    command = <<-EOT
      curl -sf -X POST "${var.pulsewatch_api_url}/api/v1/orgs/${var.pulsewatch_org_id}/monitors" \
        -H "Authorization: Bearer ${var.pulsewatch_api_key}" \
        -H "Content-Type: application/json" \
        -d '{"name":"API Health (Terraform)","type":"http","targetUrl":"https://example.com/health","intervalSeconds":300,"regions":["us-east"]}'
    EOT
  }
}

# Smoke-test client: cd integrations/terraform/provider && go run .
