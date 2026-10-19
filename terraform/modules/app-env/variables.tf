# ── Server connection ─────────────────────────────────────────────────────────

variable "vps_host" {
  description = "IP address or hostname of the VPS."
  type        = string
}

variable "vps_ssh_private_key" {
  description = "PEM-encoded private SSH key for root access to the VPS."
  type        = string
  sensitive   = true
}

variable "env_file_path" {
  description = "Absolute path on the VPS where the .env file is written."
  type        = string
  # e.g. "/opt/pageos/.env" or "/opt/pageos-dev/.env"
}

# ── Environment identity ──────────────────────────────────────────────────────

variable "pageos_env" {
  description = "Runtime environment label: production | dev | local"
  type        = string
}

variable "next_public_api_url" {
  description = "Public base URL of the API, used by the Next.js browser bundle."
  type        = string
}

variable "pageos_allowed_origins" {
  description = "Comma-separated list of allowed CORS origins."
  type        = string
}

variable "next_public_app_env" {
  description = "App environment exposed to the browser (production | dev)."
  type        = string
}

# ── Database ──────────────────────────────────────────────────────────────────

variable "postgres_user" {
  description = "PostgreSQL superuser name."
  type        = string
  default     = "pageos"
}

variable "postgres_password" {
  description = "PostgreSQL superuser password."
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "Default database name (pageos for prod, pageos_dev for dev)."
  type        = string
}

# ── Object storage (MinIO) ────────────────────────────────────────────────────

variable "minio_root_user" {
  description = "MinIO root (admin) username."
  type        = string
  default     = "pageos"
}

variable "minio_root_password" {
  description = "MinIO root password."
  type        = string
  sensitive   = true
}

variable "s3_bucket" {
  description = "MinIO bucket name for document storage."
  type        = string
}

# ── SMTP ──────────────────────────────────────────────────────────────────────

variable "smtp_host" {
  description = "SMTP server hostname (leave empty to disable email)."
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP server port."
  type        = number
  default     = 587
}

variable "smtp_user" {
  description = "SMTP authentication username."
  type        = string
  default     = ""
}

variable "smtp_pass" {
  description = "SMTP authentication password."
  type        = string
  sensitive   = true
  default     = ""
}

variable "smtp_from" {
  description = "From address used for outbound emails."
  type        = string
  default     = "noreply@pageos.org"
}

# ── Microsoft Graph ───────────────────────────────────────────────────────────

variable "msgraph_client_id" {
  description = "Azure AD application (client) ID."
  type        = string
  sensitive   = true
  default     = ""
}

variable "msgraph_client_secret" {
  description = "Azure AD application client secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "msgraph_tenant_id" {
  description = "Azure AD directory (tenant) ID."
  type        = string
  sensitive   = true
  default     = ""
}

variable "msgraph_redirect_url" {
  description = "OAuth callback URL for Graph data access (mail/calendar)."
  type        = string
  default     = ""
}

variable "msgraph_sso_redirect_url" {
  description = "OAuth callback URL for Microsoft SSO login."
  type        = string
  default     = ""
}

variable "msgraph_token_key" {
  description = "64-char hex AES-GCM key for encrypting Graph tokens at rest."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Approval email mailbox ────────────────────────────────────────────────────

variable "approvals_email_user" {
  description = "Mailbox address for approval reply emails."
  type        = string
  default     = "approvals@pageaml.com"
}

variable "approvals_email_pass" {
  description = "Password for the approvals mailbox (IMAP fallback only)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "approvals_imap_host" {
  description = "IMAP server hostname (leave empty when using Microsoft Graph)."
  type        = string
  default     = ""
}

# ── Bank statement email mailbox ──────────────────────────────────────────────

variable "bankstmt_email_user" {
  description = "Mailbox address for inbound bank statement emails."
  type        = string
  default     = "bankstatements@pageaml.com"
}

variable "bankstmt_email_pass" {
  description = "Password for the bank statement mailbox (IMAP fallback only)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "bankstmt_imap_host" {
  description = "IMAP server hostname (leave empty when using Microsoft Graph)."
  type        = string
  default     = ""
}
