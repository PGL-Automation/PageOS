// Package observability provides cross-cutting logging, tracing, and metrics.
// v1 ships structured logging via slog; tracing/metrics hooks are added here
// so the rest of the codebase depends on this package, not on a vendor.
package observability

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger returns a JSON structured logger at the given level.
func NewLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler)
}
