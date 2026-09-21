package portfoliohttp

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

func (h *Handler) createCorporateAction(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.CreateCorporateActionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	action, err := h.svc.CreateCorporateAction(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, action)
}

func (h *Handler) listCorporateActions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	q := r.URL.Query()
	var instrumentID *uuid.UUID
	if s := q.Get("instrument_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid instrument_id")
			return
		}
		instrumentID = &id
	}
	actions, err := h.svc.ListCorporateActions(r.Context(), instrumentID, q.Get("status"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if actions == nil {
		actions = []portfolio.CorporateAction{}
	}
	httpx.JSON(w, http.StatusOK, actions)
}

func (h *Handler) getCorporateAction(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	action, err := h.svc.GetCorporateAction(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "corporate action not found")
		return
	}
	httpx.JSON(w, http.StatusOK, action)
}

func (h *Handler) processCorporateAction(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	impacts, err := h.svc.ProcessCorporateAction(r.Context(), id, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "process_failed", err.Error())
		return
	}
	if impacts == nil {
		impacts = []portfolio.CorporateActionImpact{}
	}
	httpx.JSON(w, http.StatusOK, impacts)
}

func (h *Handler) cancelCorporateAction(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	// Only pending actions may be cancelled.
	action, err := h.svc.GetCorporateAction(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "corporate action not found")
		return
	}
	if action.Status != "pending" {
		httpx.Error(w, http.StatusBadRequest, "invalid_state", "only pending corporate actions can be cancelled")
		return
	}
	if _, err := h.pool.Exec(r.Context(), `
		UPDATE portfolio.corporate_action
		SET    status     = 'cancelled',
		       updated_at = now()
		WHERE  id = $1
	`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "cancel_failed", err.Error())
		return
	}
	action.Status = "cancelled"
	httpx.JSON(w, http.StatusOK, action)
}
