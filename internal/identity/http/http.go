// Package identityhttp exposes the identity capabilities over HTTP and the
// session-authentication middleware other modules mount in front of protected
// routes.
package identityhttp

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/pagegroup/pageos/internal/identity"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const sessionCookie = "pageos_session"

// cookieSecure returns true unless COOKIE_SECURE is explicitly set to "false".
// In production the flag should never be overridden; it is only relaxed for
// local HTTP-only dev environments.
func cookieSecure() bool {
	return os.Getenv("COOKIE_SECURE") != "false"
}

// registrationEnabled returns true only when REGISTRATION_ENABLED=true.
func registrationEnabled() bool {
	return os.Getenv("REGISTRATION_ENABLED") == "true"
}

// loginAttempt tracks failed login attempts per IP.
type loginAttempt struct {
	count     int
	windowEnd time.Time
}

const (
	rateLimitWindow   = 10 * time.Minute
	rateLimitMaxTries = 10
)

type ctxKey int

const userKey ctxKey = 0

// Handler wires HTTP to the identity service.
type Handler struct {
	svc         *identity.Service
	loginFailed sync.Map // IP string → *loginAttempt
}

func New(svc *identity.Service) *Handler {
	return &Handler{svc: svc}
}

// remoteIP extracts the client IP, stripping the port.
func remoteIP(r *http.Request) string {
	host := r.Header.Get("X-Forwarded-For")
	if host == "" {
		host = r.RemoteAddr
	}
	ip, _, err := net.SplitHostPort(host)
	if err != nil {
		return host
	}
	return ip
}

// recordFailure increments the failed-login counter for ip and returns whether
// the IP is now rate-limited.
func (h *Handler) recordFailure(ip string) bool {
	now := time.Now()
	val, _ := h.loginFailed.LoadOrStore(ip, &loginAttempt{windowEnd: now.Add(rateLimitWindow)})
	att := val.(*loginAttempt)

	if now.After(att.windowEnd) {
		// Window has expired — reset.
		att.count = 1
		att.windowEnd = now.Add(rateLimitWindow)
		return false
	}
	att.count++
	if att.count > rateLimitMaxTries {
		log.Printf("identity: rate-limit triggered for IP %s (%d failures in window)", ip, att.count)
		return true
	}
	return false
}

// clearFailures resets the failed-login counter for ip on successful auth.
func (h *Handler) clearFailures(ip string) {
	h.loginFailed.Delete(ip)
}

// isRateLimited reports whether ip has already exceeded the failure threshold.
func (h *Handler) isRateLimited(ip string) bool {
	val, ok := h.loginFailed.Load(ip)
	if !ok {
		return false
	}
	att := val.(*loginAttempt)
	if time.Now().After(att.windowEnd) {
		return false
	}
	return att.count > rateLimitMaxTries
}

// Routes returns the identity router mounted under /auth.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Post("/register", h.register)
	r.Post("/login", h.login)

	// Authenticated endpoints.
	r.Group(func(r chi.Router) {
		r.Use(h.Authenticator)
		r.Post("/logout", h.logout)
		r.Get("/me", h.me)
	})
	return r
}

// Authenticator resolves the session cookie to a user and stores it in the
// request context. Mount it in front of any protected route.
func (h *Handler) Authenticator(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil || c.Value == "" {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		user, err := h.svc.ResolveSession(r.Context(), c.Value)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		ctx := context.WithValue(r.Context(), userKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserFrom returns the authenticated user from the request context.
func UserFrom(ctx context.Context) (identity.User, bool) {
	u, ok := ctx.Value(userKey).(identity.User)
	return u, ok
}

type credentials struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if !registrationEnabled() {
		httpx.Error(w, http.StatusForbidden, "registration_disabled", "Registration is disabled; contact your administrator.")
		return
	}
	var in credentials
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	user, err := h.svc.Register(r.Context(), in.Email, in.Password, in.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "register_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, user)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	ip := remoteIP(r)
	if h.isRateLimited(ip) {
		log.Printf("identity: login blocked for rate-limited IP %s", ip)
		httpx.Error(w, http.StatusTooManyRequests, "rate_limited", "too many failed attempts; try again later")
		return
	}

	var in credentials
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	user, err := h.svc.Authenticate(r.Context(), in.Email, in.Password)
	if err != nil {
		if h.recordFailure(ip) {
			log.Printf("identity: IP %s exceeded login failure threshold", ip)
		}
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
	h.clearFailures(ip)
	token, expiresAt, err := h.svc.CreateSession(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not create session")
		return
	}
	setSessionCookie(w, token, expiresAt)
	httpx.JSON(w, http.StatusOK, user)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = h.svc.RevokeSession(r.Context(), c.Value)
	}
	clearSessionCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

func setSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: http.SameSiteStrictMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: http.SameSiteStrictMode,
	})
}
