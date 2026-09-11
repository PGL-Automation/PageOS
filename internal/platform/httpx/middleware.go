package httpx

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// allowedOrigins parses the PAGEOS_ALLOWED_ORIGINS environment variable
// (comma-separated list) into a set for O(1) lookup.
func allowedOrigins() map[string]struct{} {
	raw := os.Getenv("PAGEOS_ALLOWED_ORIGINS")
	set := make(map[string]struct{})
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			set[o] = struct{}{}
		}
	}
	return set
}

// CORS sets cross-origin headers using an explicit allowlist.
//
// Allowed when:
//   - PAGEOS_ENV == "local"  (local development convenience), OR
//   - The request Origin is listed in PAGEOS_ALLOWED_ORIGINS (comma-separated).
//
// When neither condition is met the Access-Control-Allow-Origin header is
// omitted entirely, causing the browser to block the cross-origin request.
// Access-Control-Allow-Credentials: true is only set for allowed origins so
// that credentialed cross-origin requests from untrusted origins are rejected.
func CORS(next http.Handler) http.Handler {
	origins := allowedOrigins()
	isLocal := os.Getenv("PAGEOS_ENV") == "local"

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			// Always advertise that the response varies by Origin so that
			// intermediate caches never serve a cached CORS response to a
			// different origin.
			w.Header().Add("Vary", "Origin")

			_, inAllowlist := origins[origin]
			if isLocal || inAllowlist {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}
			// If the origin is not allowed, no CORS headers are set and the
			// browser will block the request.
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requestLogger emits one structured line per request with status + latency.
func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			defer func() {
				logger.Info("http request",
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"bytes", ww.BytesWritten(),
					"duration_ms", time.Since(start).Milliseconds(),
					"request_id", middleware.GetReqID(r.Context()),
				)
			}()
			next.ServeHTTP(ww, r)
		})
	}
}
