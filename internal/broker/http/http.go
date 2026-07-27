// Package brokerhttp exposes broker management over HTTP.
package brokerhttp

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/broker"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct {
	svc *broker.Service
}

func New(svc *broker.Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Post("/", h.create)
	r.Get("/", h.list)
	r.Get("/{id}", h.get)
	r.Patch("/{id}/commission", h.updateCommission)
	return r
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID      uuid.UUID `json:"subsidiary_id"`
		Code              string    `json:"code"`
		Name              string    `json:"name"`
		Type              string    `json:"type"`
		Email             string    `json:"email"`
		Phone             string    `json:"phone"`
		CommissionRateBps int32     `json:"commission_rate_bps"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Type == "" {
		in.Type = "individual"
	}
	b, err := h.svc.Create(r.Context(), in.SubsidiaryID, in.Code, in.Name, in.Type, in.Email, in.Phone, in.CommissionRateBps)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, b)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	sidStr := r.URL.Query().Get("subsidiary_id")
	if sidStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id query param required")
		return
	}
	sid, err := uuid.Parse(sidStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
		return
	}
	brokers, err := h.svc.List(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, brokers)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid broker id")
		return
	}
	b, err := h.svc.Get(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "broker not found")
		return
	}
	httpx.JSON(w, http.StatusOK, b)
}

func (h *Handler) updateCommission(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid broker id")
		return
	}
	var in struct {
		CommissionRateBps int32 `json:"commission_rate_bps"`
	}
	if !decode(w, r, &in) {
		return
	}
	b, err := h.svc.UpdateCommission(r.Context(), id, in.CommissionRateBps)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, b)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}
