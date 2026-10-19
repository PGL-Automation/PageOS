terraform {
  required_version = ">= 1.6"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # Uncomment and configure a remote backend — same options as prod.
  #
  # cloud {
  #   organization = "your-org-name"
  #   workspaces {
  #     name = "pageos-dev"
  #   }
  # }
}

# ── Dev .env file on the VPS ──────────────────────────────────────────────────
# Dev runs on the same VPS as prod but at /opt/pageos-dev/.env.
# Microsoft Graph and SSO are intentionally DISABLED on dev — approvals via
# email still work because Graph credentials are still set, but the SSO login
# button is hidden (PAGEOS_MSGRAPH_CLIENT_ID left empty in the API env, which
# is docker-compose.dev.yml-level — this .env only covers what docker-compose
# reads from the host .env file).

module "dev_env" {
  source = "../../modules/app-env"

  vps_host            = var.vps_host
  vps_ssh_private_key = var.vps_ssh_private_key
  env_file_path       = "/opt/pageos-dev/.env"

  # Environment identity
  pageos_env             = "dev"
  next_public_app_env    = "dev"
  next_public_api_url    = "https://app.pageos.org"
  pageos_allowed_origins = "https://app.pageos.org"

  # Database — separate DB name from prod
  postgres_user     = "pageos"
  postgres_password = var.postgres_password
  postgres_db       = "pageos_dev"

  # MinIO — separate bucket from prod
  minio_root_user     = "pageos"
  minio_root_password = var.minio_root_password
  s3_bucket           = "pageos-docs-dev"

  # SMTP — same credentials as prod (shared mail server)
  smtp_host = var.smtp_host
  smtp_port = var.smtp_port
  smtp_user = var.smtp_user
  smtp_pass = var.smtp_pass
  smtp_from = "noreply@pageos.org"

  # Microsoft Graph — same app registration as prod.
  # Graph permissions (Mail.Read via ApplicationAccessPolicy) are scoped to
  # specific mailboxes, so sharing credentials is safe.
  msgraph_client_id        = var.msgraph_client_id
  msgraph_client_secret    = var.msgraph_client_secret
  msgraph_tenant_id        = var.msgraph_tenant_id
  msgraph_redirect_url     = "https://app.pageos.org/api/v1/msgraph/callback"
  msgraph_sso_redirect_url = "https://app.pageos.org/api/v1/auth/microsoft/callback"
  msgraph_token_key        = var.msgraph_token_key

  # Email mailboxes
  approvals_email_user = "approvals@pageaml.com"
  bankstmt_email_user  = "bankstatements@pageaml.com"
}
