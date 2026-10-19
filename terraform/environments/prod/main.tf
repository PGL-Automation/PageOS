terraform {
  required_version = ">= 1.6"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # ── Remote state backend ────────────────────────────────────────────────────
  # Option A (recommended): Terraform Cloud — free for small teams.
  #   1. Create an account at https://app.terraform.io
  #   2. Create an organisation and a workspace named "pageos-prod"
  #   3. Uncomment the block below and fill in your org name.
  #   4. Run `terraform login` then `terraform init`.
  #
  # cloud {
  #   organization = "your-org-name"
  #   workspaces {
  #     name = "pageos-prod"
  #   }
  # }
  #
  # Option B: S3 backend (if you have an AWS account).
  #
  # backend "s3" {
  #   bucket         = "pageos-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  # }
}

# ── Providers ─────────────────────────────────────────────────────────────────

provider "github" {
  owner = var.github_owner
  token = var.github_token
}

# ── GitHub Actions secrets ────────────────────────────────────────────────────
# These allow the CI workflow to SSH into the VPS for deployment.

module "github_secrets" {
  source = "../../modules/github-secrets"

  github_owner      = var.github_owner
  github_repository = var.github_repository
  vps_host          = var.vps_host
  vps_ssh_key       = var.vps_ssh_key
  vps_known_hosts   = var.vps_known_hosts
}

# ── Production .env file on the VPS ──────────────────────────────────────────

module "prod_env" {
  source = "../../modules/app-env"

  vps_host            = var.vps_host
  vps_ssh_private_key = var.vps_ssh_private_key
  env_file_path       = "/opt/pageos/.env"

  # Environment identity
  pageos_env             = "production"
  next_public_app_env    = "production"
  next_public_api_url    = "https://pageos.org"
  pageos_allowed_origins = "https://pageos.org,https://app.pageos.org"

  # Database
  postgres_user     = "pageos"
  postgres_password = var.postgres_password
  postgres_db       = "pageos"

  # MinIO
  minio_root_user     = "pageos"
  minio_root_password = var.minio_root_password
  s3_bucket           = "pageos-docs"

  # SMTP
  smtp_host = var.smtp_host
  smtp_port = var.smtp_port
  smtp_user = var.smtp_user
  smtp_pass = var.smtp_pass
  smtp_from = "noreply@pageos.org"

  # Microsoft Graph
  msgraph_client_id        = var.msgraph_client_id
  msgraph_client_secret    = var.msgraph_client_secret
  msgraph_tenant_id        = var.msgraph_tenant_id
  msgraph_redirect_url     = "https://pageos.org/api/v1/msgraph/callback"
  msgraph_sso_redirect_url = "https://pageos.org/api/v1/auth/microsoft/callback"
  msgraph_token_key        = var.msgraph_token_key

  # Email mailboxes (Graph handles auth; IMAP fields left empty)
  approvals_email_user = "approvals@pageaml.com"
  bankstmt_email_user  = "bankstatements@pageaml.com"
}
