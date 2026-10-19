variable "github_owner" {
  description = "GitHub organisation or user that owns the repository."
  type        = string
}

variable "github_repository" {
  description = "Repository name (without the owner prefix)."
  type        = string
}

variable "vps_host" {
  description = "IP address or hostname of the VPS."
  type        = string
  sensitive   = true
}

variable "vps_ssh_key" {
  description = "Private SSH key used by CI to connect to the VPS (PEM, base64 or raw)."
  type        = string
  sensitive   = true
}

variable "vps_known_hosts" {
  description = "SSH known_hosts entry for the VPS (output of ssh-keyscan)."
  type        = string
  sensitive   = true
}
