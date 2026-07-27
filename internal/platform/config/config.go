// Package config loads typed runtime configuration from the environment.
// Secrets are never read from files in the repo — only the process env,
// which is populated per-environment (see docs/onboarding-slice-plan.md §15).
package config

import (
	"fmt"
	"os"
)

// Config is the fully-resolved runtime configuration.
type Config struct {
	Env         string
	HTTPAddr    string
	DatabaseURL string
	LogLevel    string

	// Object storage (S3-compatible: MinIO locally, AWS S3 in prod).
	S3Endpoint        string // empty = real AWS S3
	S3Bucket          string
	S3Region          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3ForcePathStyle  bool // true for MinIO

	// SMTP email (optional: if host is empty, a no-op sender is used).
	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	SMTPFrom string
}

// Load reads configuration from the environment, applying sensible local defaults.
func Load() (Config, error) {
	cfg := Config{
		Env:         getenv("PAGEOS_ENV", "local"),
		HTTPAddr:    getenv("PAGEOS_HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("PAGEOS_DATABASE_URL"),
		LogLevel:    getenv("PAGEOS_LOG_LEVEL", "info"),

		S3Endpoint:        getenv("PAGEOS_S3_ENDPOINT", "http://minio:9000"),
		S3Bucket:          getenv("PAGEOS_S3_BUCKET", "pageos"),
		S3Region:          getenv("PAGEOS_S3_REGION", "us-east-1"),
		S3AccessKeyID:     getenv("PAGEOS_S3_ACCESS_KEY_ID", "pageos"),
		S3SecretAccessKey: getenv("PAGEOS_S3_SECRET_ACCESS_KEY", "pageos-dev-secret"),
		S3ForcePathStyle:  getenv("PAGEOS_S3_FORCE_PATH_STYLE", "true") == "true",

		SMTPHost: os.Getenv("PAGEOS_SMTP_HOST"),
		SMTPPort: getenvInt("PAGEOS_SMTP_PORT", 587),
		SMTPUser: os.Getenv("PAGEOS_SMTP_USER"),
		SMTPPass: os.Getenv("PAGEOS_SMTP_PASS"),
		SMTPFrom: getenv("PAGEOS_SMTP_FROM", "noreply@pagecapital.com"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("PAGEOS_DATABASE_URL is required")
	}

	return cfg, nil
}

func getenvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return fallback
	}
	return n
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
