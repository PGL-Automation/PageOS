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
	Env         string // "local" | "staging" | "prod"
	HTTPAddr    string // e.g. ":8080"
	DatabaseURL string // pgx-compatible connection string
	LogLevel    string // "debug" | "info" | "warn" | "error"
}

// Load reads configuration from the environment, applying sensible local
// defaults. It returns an error only for values that have no safe default.
func Load() (Config, error) {
	cfg := Config{
		Env:         getenv("PAGEOS_ENV", "local"),
		HTTPAddr:    getenv("PAGEOS_HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("PAGEOS_DATABASE_URL"),
		LogLevel:    getenv("PAGEOS_LOG_LEVEL", "info"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("PAGEOS_DATABASE_URL is required")
	}

	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
