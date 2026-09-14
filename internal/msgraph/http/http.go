package msgraphhttp

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/msgraph"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const stateCookie = "pageos_ms_state"

type Handler struct{ svc *msgraph.Service }

func New(svc *msgraph.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Get("/connect",        h.connect)
	r.Get("/callback",       h.callback)
	r.Get("/status",         h.status)
	r.Post("/disconnect",    h.disconnect)
	r.Get("/mail",           h.mail)
	r.Get("/calendar",       h.calendar)
	r.Get("/teams",          h.teams)
	r.Get("/presence",       h.presence)
	return r
}

// connect generates a random state, stores it in a short-lived cookie, and
// redirects the user to the Microsoft OAuth authorization page.
func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not generate state")
		return
	}
	state := base64.RawURLEncoding.EncodeToString(b)

	http.SetCookie(w, &http.Cookie{
		Name:     stateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})
	http.Redirect(w, r, h.svc.AuthURL(state), http.StatusFound)
}

// callback handles the redirect from Microsoft after the user grants consent.
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		http.Redirect(w, r, "/microsoft?error=auth_failed", http.StatusFound)
		return
	}

	// CSRF: compare state param to the cookie set by /connect.
	stateCookieVal, err := r.Cookie(stateCookie)
	if err != nil || stateCookieVal.Value == "" || stateCookieVal.Value != r.URL.Query().Get("state") {
		http.Redirect(w, r, "/microsoft?error=auth_failed", http.StatusFound)
		return
	}

	// Clear the state cookie immediately.
	http.SetCookie(w, &http.Cookie{
		Name:   stateCookie,
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		http.Redirect(w, r, "/microsoft?error=auth_failed", http.StatusFound)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, "/microsoft?error=auth_failed", http.StatusFound)
		return
	}

	if err := h.svc.ExchangeCode(r.Context(), caller.ID, code); err != nil {
		http.Redirect(w, r, "/microsoft?error=auth_failed", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/microsoft?connected=1", http.StatusFound)
}

// status returns whether the caller has a connected Microsoft account.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	connected, msEmail, err := h.svc.Status(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"connected":       connected,
		"microsoft_email": msEmail,
	})
}

// disconnect removes the stored Microsoft tokens for the caller.
func (h *Handler) disconnect(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	if err := h.svc.Disconnect(r.Context(), caller.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// notConnected is the JSON shape returned when the user has not linked Microsoft.
func notConnected(w http.ResponseWriter) {
	httpx.JSON(w, http.StatusOK, map[string]bool{"connected": false})
}

func callerID(r *http.Request) (uuid.UUID, bool) {
	caller, ok := identityhttp.UserFrom(r.Context())
	return caller.ID, ok
}

func (h *Handler) mail(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	msgs, err := h.svc.GetMail(r.Context(), id)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func (h *Handler) calendar(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	events, err := h.svc.GetCalendar(r.Context(), id)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"events": events})
}

func (h *Handler) teams(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	chats, err := h.svc.GetTeamsChats(r.Context(), id)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"chats": chats})
}

func (h *Handler) presence(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	p, err := h.svc.GetPresence(r.Context(), id)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, p)
}
