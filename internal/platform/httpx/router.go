// Package httpx wires the HTTP router, shared middleware, and JSON responses.
// Module handlers are mounted here; this package holds no business logic.
package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Deps are the shared dependencies handlers may need.
type Deps struct {
	DB *pgxpool.Pool
}

// NewRouter builds the root HTTP handler with base middleware, mounts the
// health endpoints, and lets the caller register module routes under /api/v1
// via mountAPI (keeps module wiring in main, not in this package).
func NewRouter(logger *slog.Logger, deps Deps, mountAPI func(chi.Router)) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger(logger))
	r.Use(middleware.Recoverer)
	r.Use(CORS)

	// Warn once at startup if /readyz is running without a token guard.
	healthToken := os.Getenv("HEALTH_CHECK_TOKEN")
	if healthToken == "" {
		logger.Warn("HEALTH_CHECK_TOKEN is not set; /readyz is unauthenticated — set the env var to enable bearer-token protection")
	}

	// Liveness: process is up.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Readiness: dependencies (DB) are reachable.
	// If HEALTH_CHECK_TOKEN is set, require "Authorization: Bearer <token>" to
	// prevent leaking DB topology to unauthenticated callers. When the env var
	// is absent the endpoint retains its original open behaviour (backwards compat).
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		if healthToken != "" {
			auth := strings.TrimSpace(req.Header.Get("Authorization"))
			want := "Bearer " + healthToken
			if auth != want {
				// Return 404 so the endpoint is not discoverable by scanners.
				http.NotFound(w, req)
				return
			}
		}

		ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
		defer cancel()
		if err := deps.DB.Ping(ctx); err != nil {
			JSON(w, http.StatusServiceUnavailable, map[string]string{
				"status": "unavailable",
				"db":     "unreachable",
			})
			return
		}
		JSON(w, http.StatusOK, map[string]string{"status": "ready", "db": "ok"})
	})

	// v1 API surface. Module routers mount under here.
	r.Route("/api/v1", func(r chi.Router) {
		if mountAPI != nil {
			mountAPI(r)
		}
	})

	return r
}
