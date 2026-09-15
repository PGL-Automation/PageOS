package msgraphhttp

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/identity"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/msgraph"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const stateCookie    = "pageos_ms_state"
const ssoStateCookie = "pageos_ms_sso_state"

type Handler struct{ svc *msgraph.Service }

func New(svc *msgraph.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Get("/connect",                       h.connect)
	r.Get("/callback",                      h.callback)
	r.Get("/status",                        h.status)
	r.Post("/disconnect",                   h.disconnect)
	// Mail — read + write
	r.Get("/mail",                          h.mail)
	r.Get("/mail/{messageId}",              h.mailBody)
	r.Post("/mail/{messageId}/reply",       h.replyEmail)
	r.Post("/mail/{messageId}/reply-all",   h.replyAllEmail)
	r.Post("/mail/compose",                 h.composeEmail)
	// Calendar — read + write
	r.Get("/calendar",                      h.calendar)
	r.Post("/calendar/events",              h.createEvent)
	// Teams — read + write
	r.Get("/teams",                         h.teams)
	r.Get("/teams/chats",                   h.chatSummaries)
	r.Get("/teams/{chatId}/messages",                              h.chatMessages)
	r.Get("/teams/{chatId}/page",                                  h.chatPage)
	r.Post("/teams/{chatId}/send",                                 h.sendTeamsMessage)
	r.Delete("/teams/{chatId}/messages/{messageId}",               h.deleteMessage)
	r.Post("/teams/{chatId}/messages/{messageId}/react",           h.reactMessage)
	r.Post("/teams/{chatId}/messages/{messageId}/unreact",         h.unreactMessage)
	r.Get("/teams/{chatId}/read-status",                           h.chatReadStatus)
	r.Get("/presence/user/{msId}",                                 h.otherUserPresence)
	r.Get("/users/search",                  h.searchUsers)
	r.Post("/teams/new-chat",               h.newChat)
	r.Get("/mail/thread/{conversationId}",  h.emailThread)
	r.Get("/unread-count",                  h.unreadCount)
	// Presence — read only
	r.Get("/presence",                      h.presence)
	r.Post("/presence",                     h.setPresence)
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

// status returns whether the caller has a connected Microsoft account and current scope.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	connected, msEmail, scope, err := h.svc.StatusWithScope(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	// Check whether the stored scope includes the write permissions.
	needsReconnect := connected && (!strings.Contains(scope, "Mail.Send") ||
		!strings.Contains(scope, "Calendars.ReadWrite") ||
		!strings.Contains(scope, "Chat.ReadWrite"))
	httpx.JSON(w, http.StatusOK, map[string]any{
		"connected":       connected,
		"microsoft_email": msEmail,
		"needs_reconnect": needsReconnect,
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
	limit := 20
	if t := r.URL.Query().Get("top"); t != "" {
		if n := 0; strings.Contains("0123456789", t[:1]) {
			for _, c := range t { n = n*10 + int(c-'0') }
			if n > 0 && n <= 50 { limit = n }
		}
	}
	chats, err := h.svc.GetTeamsChats(r.Context(), id, limit)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"chats": chats})
}

func (h *Handler) searchUsers(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpx.JSON(w, http.StatusOK, map[string]any{"users": []any{}}); return
	}
	users, err := h.svc.SearchUsers(r.Context(), id, q)
	if err != nil { httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users})
}

func (h *Handler) newChat(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ RecipientID string `json:"recipient_ms_id"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.RecipientID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "recipient_ms_id is required"); return
	}
	chatID, err := h.svc.CreateOneOnOneChat(r.Context(), id, in.RecipientID)
	if err != nil { httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return }
	httpx.JSON(w, http.StatusOK, map[string]string{"chat_id": chatID})
}

func (h *Handler) presence(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	p, err := h.svc.GetPresence(r.Context(), id)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) setPresence(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct {
		Availability       string `json:"availability"`
		ExpirationDuration string `json:"expirationDuration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Availability == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "availability is required"); return
	}
	if err := h.svc.SetPresence(r.Context(), id, in.Availability, in.ExpirationDuration); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Mail write handlers ────────────────────────────────────────────────────────

func (h *Handler) mailBody(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	body, err := h.svc.GetEmailBody(r.Context(), id, chi.URLParam(r, "messageId"))
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]string{"body": body})
}

func (h *Handler) replyEmail(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ Comment string `json:"comment"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Comment == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "comment is required"); return
	}
	if err := h.svc.ReplyToEmail(r.Context(), id, chi.URLParam(r, "messageId"), in.Comment); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) replyAllEmail(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ Comment string `json:"comment"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Comment == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "comment is required"); return
	}
	if err := h.svc.ReplyAllToEmail(r.Context(), id, chi.URLParam(r, "messageId"), in.Comment); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) composeEmail(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct {
		To      string `json:"to"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.To == "" || in.Subject == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "to and subject are required"); return
	}
	if err := h.svc.SendEmail(r.Context(), id, in.To, in.Subject, in.Body); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Calendar write handlers ────────────────────────────────────────────────────

func (h *Handler) createEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in msgraph.CreateEventReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Subject == "" || in.Start == "" || in.End == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subject, start, and end are required"); return
	}
	ev, err := h.svc.CreateCalendarEvent(r.Context(), id, in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusCreated, ev)
}

// ── Teams write handlers ───────────────────────────────────────────────────────

func (h *Handler) chatSummaries(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	limit := 20
	if t := r.URL.Query().Get("top"); t != "" {
		if n := 0; strings.Contains("0123456789", t[:1]) {
			for _, c := range t { n = n*10 + int(c-'0') }
			if n > 0 && n <= 50 { limit = n }
		}
	}
	chats, err := h.svc.GetChatSummaries(r.Context(), id, limit)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"chats": chats})
}

func (h *Handler) chatPage(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	top := 50
	if t := r.URL.Query().Get("top"); t != "" {
		if n := 0; strings.Contains("0123456789", t[:1]) {
			for _, c := range t { n = n*10 + int(c-'0') }
			if n > 0 && n <= 100 { top = n }
		}
	}
	nextLink := r.URL.Query().Get("nextLink")
	page, err := h.svc.GetChatPage(r.Context(), id, chi.URLParam(r, "chatId"), top, nextLink)
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, page)
}

func (h *Handler) emailThread(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	msgs, err := h.svc.GetEmailThread(r.Context(), id, chi.URLParam(r, "conversationId"))
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	count, err := h.svc.GetInboxUnreadCount(r.Context(), id)
	if err != nil { httpx.JSON(w, http.StatusOK, map[string]int{"emails": 0}); return }
	httpx.JSON(w, http.StatusOK, map[string]int{"emails": count})
}

func (h *Handler) chatMessages(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	msgs, err := h.svc.GetChatMessages(r.Context(), id, chi.URLParam(r, "chatId"))
	if err != nil { notConnected(w); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func (h *Handler) deleteMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	if err := h.svc.DeleteTeamsMessage(r.Context(), id, chi.URLParam(r, "chatId"), chi.URLParam(r, "messageId")); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "graph_error", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) reactMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ ReactionType string `json:"reactionType"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ReactionType == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "reactionType is required"); return
	}
	if err := h.svc.ReactToMessage(r.Context(), id, chi.URLParam(r, "chatId"), chi.URLParam(r, "messageId"), in.ReactionType); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "graph_error", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) unreactMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ ReactionType string `json:"reactionType"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ReactionType == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "reactionType is required"); return
	}
	if err := h.svc.UnreactToMessage(r.Context(), id, chi.URLParam(r, "chatId"), chi.URLParam(r, "messageId"), in.ReactionType); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "graph_error", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) sendTeamsMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	var in struct{ Content string `json:"content"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Content == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "content is required"); return
	}
	if err := h.svc.SendTeamsMessage(r.Context(), id, chi.URLParam(r, "chatId"), in.Content); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) chatReadStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	status, err := h.svc.GetChatReadStatus(r.Context(), id, chi.URLParam(r, "chatId"))
	if err != nil { httpx.Error(w, http.StatusInternalServerError, "internal", err.Error()); return }
	httpx.JSON(w, http.StatusOK, map[string]any{"members": status})
}

func (h *Handler) otherUserPresence(w http.ResponseWriter, r *http.Request) {
	id, ok := callerID(r)
	if !ok { httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated"); return }
	p, err := h.svc.GetOtherUserPresence(r.Context(), id, chi.URLParam(r, "msId"))
	if err != nil { httpx.JSON(w, http.StatusOK, map[string]string{"availability": "Unknown", "activity": ""}); return }
	httpx.JSON(w, http.StatusOK, p)
}

// ── SSO (login via Microsoft) ──────────────────────────────────────────────────

// SSORedirect initiates the Microsoft SSO login flow. No PageOS session required.
// Generates a CSRF state token, stores it in a short-lived cookie, and redirects
// the browser to Microsoft's authorization page.
func (h *Handler) SSORedirect(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not generate state")
		return
	}
	state := base64.RawURLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{
		Name:     ssoStateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})
	http.Redirect(w, r, h.svc.SSOAuthURL(state), http.StatusFound)
}

// SSOCallback handles Microsoft's redirect after the user authenticates.
// It validates the CSRF state, exchanges the code for the user's email, looks up
// the matching PageOS account, creates a session, and redirects to the dashboard.
func (h *Handler) SSOCallback(identitySvc *identity.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Admin consent callback — Microsoft redirects here with admin_consent=True (no code).
		// Just redirect to login with a success flag so the admin sees a friendly message.
		if r.URL.Query().Get("admin_consent") == "True" {
			http.Redirect(w, r, "/login?admin_consent=1", http.StatusFound)
			return
		}

		// CSRF check
		stateCookie, err := r.Cookie(ssoStateCookie)
		if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
			http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: ssoStateCookie, Value: "", Path: "/", MaxAge: -1})

		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
			return
		}

		code := r.URL.Query().Get("code")
		if code == "" {
			http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
			return
		}

		// Exchange code → Microsoft email
		msEmail, err := h.svc.ExchangeCodeForEmail(r.Context(), code)
		if err != nil {
			http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
			return
		}

		// Find the matching PageOS user by email
		user, err := identitySvc.FindByEmail(r.Context(), msEmail)
		if err != nil {
			// No PageOS account for this Microsoft email
			http.Redirect(w, r, "/login?error=no_account", http.StatusFound)
			return
		}

		// Create PageOS session
		token, expiresAt, err := identitySvc.CreateSession(r.Context(), user.ID)
		if err != nil {
			http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
			return
		}

		// Set session cookie (same settings as the regular login flow)
		secure := r.TLS != nil
		cookieSecure := secure
		if v := r.Header.Get("X-Forwarded-Proto"); v == "https" {
			cookieSecure = true
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "pageos_session",
			Value:    token,
			Path:     "/",
			Expires:  expiresAt,
			HttpOnly: true,
			Secure:   cookieSecure,
			SameSite: http.SameSiteLaxMode,
		})

		// Return HTML instead of 302 redirect.
		// Browsers increasingly block Set-Cookie headers in 3xx redirect responses
		// during cross-site OAuth flows (ITP, ETP, Privacy Sandbox).
		// A 200 HTML response with the cookie in its headers is always accepted;
		// the JavaScript then navigates client-side after the cookie is stored.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><title>PageOS – Signing in</title></head>
<body>
<p style="font-family:system-ui;text-align:center;padding:3rem;color:#475569">Signing you in…</p>
<script>window.location.replace("/dashboard");</script>
</body></html>`)
	}
}
