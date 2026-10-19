# Dev shares the same VPS and most credentials as prod.
# Only the DB name, bucket, and URLs differ (hardcoded in main.tf above).

variable "vps_host" {
  description = "IP address of the VPS (same server as prod)."
  type        = string
  sensitive   = true
}

variable "vps_ssh_private_key" {
  description = "PEM private SSH key Terraform uses to write the dev .env file."
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL password (same as prod — separate DB name keeps data isolated)."
  type        = string
  sensitive   = true
}

variable "minio_root_password" {
  description = "MinIO root password (same as prod — separate bucket keeps data isolated)."
  type        = string
  sensitive   = true
}

variable "smtp_host"  { type = string; default = "" }
variable "smtp_port"  { type = number; default = 587 }
variable "smtp_user"  { type = string; default = "" }
variable "smtp_pass"  { type = string; sensitive = true; default = "" }

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
  type      = string
  sensitive = true
  default   = ""
}
