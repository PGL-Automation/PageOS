terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

# ── GitHub Actions secrets ────────────────────────────────────────────────────
# These three secrets are consumed by .github/workflows/deploy-prod.yml and
# deploy-dev.yml.  Terraform is the single source of truth for their values;
# never update them manually in the GitHub UI.

resource "github_actions_secret" "vps_host" {
  repository      = var.github_repository
  secret_name     = "VPS_HOST"
  plaintext_value = var.vps_host
}

resource "github_actions_secret" "vps_ssh_key" {
  repository      = var.github_repository
  secret_name     = "VPS_SSH_KEY"
  plaintext_value = var.vps_ssh_key
}

resource "github_actions_secret" "vps_known_hosts" {
  repository      = var.github_repository
  secret_name     = "VPS_KNOWN_HOSTS"
  plaintext_value = var.vps_known_hosts
}
