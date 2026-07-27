// Package httpx wires the HTTP router, shared middleware, and JSON responses.
// Module handlers are mounted here; this package holds no business logic.
package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Deps are the shared dependencies handlers may need.
type Deps struct {
	DB *pgxpool.Pool
}

// NewRouter builds the root HTTP handler with base middleware and mounts
// the health endpoints. Module routes get mounted here as they land.
func NewRouter(logger *slog.Logger, deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger(logger))
	r.Use(middleware.Recoverer)

	// Liveness: process is up.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Readiness: dependencies (DB) are reachable.
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
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
		// e.g. r.Mount("/onboarding", onboardinghttp.Router(...))
	})

	return r
}
