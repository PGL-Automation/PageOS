// Package notifhttp exposes in-app notification endpoints.
package notifhttp

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/notification"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Get("/", h.list)
	r.Get("/count", h.count)
	r.Post("/{id}/read", h.markRead)
	r.Post("/read-all", h.markAllRead)
	return r
}

// GET /api/v1/notifications[?limit=N]
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, unread, err := notification.List(r.Context(), h.pool, user.ID, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []notification.InAppRow{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":        items,
		"unread_count": unread,
	})
}

// GET /api/v1/notifications/count
func (h *Handler) count(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	n, err := notification.UnreadCount(r.Context(), h.pool, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"unread_count": n})
}

// POST /api/v1/notifications/:id/read
func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := notification.MarkRead(r.Context(), h.pool, id, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/v1/notifications/read-all
func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if err := notification.MarkAllRead(r.Context(), h.pool, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
