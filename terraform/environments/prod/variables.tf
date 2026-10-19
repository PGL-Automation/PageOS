# ── GitHub ────────────────────────────────────────────────────────────────────

variable "github_token" {
  description = "GitHub personal access token with repo and secrets permissions."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub organisation that owns the repository."
  type        = string
  default     = "PGL-Automation"
}

variable "github_repository" {
  description = "Repository name."
  type        = string
  default     = "PageOS"
}

# ── VPS access ────────────────────────────────────────────────────────────────

variable "vps_host" {
  description = "IP address of the production VPS."
  type        = string
  sensitive   = true
}

variable "vps_ssh_key" {
  description = "Private SSH key for CI (stored as GitHub secret VPS_SSH_KEY)."
  type        = string
  sensitive   = true
}

variable "vps_ssh_private_key" {
  description = "PEM private SSH key Terraform uses directly to write the .env file."
  type        = string
  sensitive   = true
}

variable "vps_known_hosts" {
  description = "SSH known_hosts entry for the VPS."
  type        = string
  sensitive   = true
}

# ── Secrets ───────────────────────────────────────────────────────────────────

variable "postgres_password" {
  description = "PostgreSQL superuser password."
  type        = string
  sensitive   = true
}

variable "minio_root_password" {
  description = "MinIO root password."
  type        = string
  sensitive   = true
}

variable "smtp_host" {
  type    = string
  default = ""
}

variable "smtp_port" {
  type    = number
  default = 587
}

variable "smtp_user" {
  type    = string
  default = ""
}

variable "smtp_pass" {
  type      = string
  sensitive = true
  default   = ""
}

variable "msgraph_client_id" {
  type      = string
  sensitive = true
  default   = "7f0c1881-c644-45eb-906c-438e96c8d6dc"
}

variable "msgraph_client_secret" {
  type      = string
  sensitive = true
}

variable "msgraph_tenant_id" {
  type      = string
  sensitive = true
  default   = "c5367046-962e-4f7c-bea6-24fa415cd319"
}

variable "msgraph_token_key" {
  description = "64-char hex AES-GCM key. Generate: openssl rand -hex 32"
  type        = string
  sensitive   = true
  default     = ""
}
