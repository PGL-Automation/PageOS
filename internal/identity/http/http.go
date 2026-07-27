// Package identityhttp exposes the identity capabilities over HTTP and the
// session-authentication middleware other modules mount in front of protected
// routes.
package identityhttp

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/pagegroup/pageos/internal/identity"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const sessionCookie = "pageos_session"

type ctxKey int

const userKey ctxKey = 0

// Handler wires HTTP to the identity service.
type Handler struct {
	svc *identity.Service
}

func New(svc *identity.Service) *Handler {
	return &Handler{svc: svc}
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
	var in credentials
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	user, err := h.svc.Authenticate(r.Context(), in.Email, in.Password)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
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
		SameSite: http.SameSiteLaxMode,
		// Secure must be enabled behind TLS in staging/prod.
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
