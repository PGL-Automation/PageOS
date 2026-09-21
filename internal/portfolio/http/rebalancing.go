// Package portfoliohttp exposes investment portfolio management over HTTP.
package portfoliohttp

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

// GET /rebalancing/targets?fund_id=xxx
func (h *Handler) listTargetAllocations(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	fundIDStr := r.URL.Query().Get("fund_id")
	if fundIDStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(fundIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	targets, err := h.svc.ListTargetAllocations(r.Context(), fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if targets == nil {
		targets = []portfolio.TargetAllocation{}
	}
	httpx.JSON(w, http.StatusOK, targets)
}

// POST /rebalancing/targets
func (h *Handler) setTargetAllocation(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.SetTargetAllocationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	target, err := h.svc.SetTargetAllocation(r.Context(), in, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "set_target_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, target)
}

// DELETE /rebalancing/targets/{id}
func (h *Handler) deleteTargetAllocation(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.DeleteTargetAllocation(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /rebalancing/drift?fund_id=xxx
func (h *Handler) analyseDrift(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	fundIDStr := r.URL.Query().Get("fund_id")
	if fundIDStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(fundIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	analysis, err := h.svc.AnalyseDrift(r.Context(), fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "drift_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, analysis)
}

// GET /rebalancing/suggestions?fund_id=xxx
func (h *Handler) generateRebalancingTrades(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	fundIDStr := r.URL.Query().Get("fund_id")
	if fundIDStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(fundIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	analysis, err := h.svc.GenerateRebalancingTrades(r.Context(), fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "suggestions_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, analysis)
}

// POST /rebalancing/execute?fund_id=xxx
func (h *Handler) executeRebalancing(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	fundIDStr := r.URL.Query().Get("fund_id")
	if fundIDStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(fundIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	txns, err := h.svc.ExecuteRebalancing(r.Context(), fundID, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "execute_failed", err.Error())
		return
	}
	if txns == nil {
		txns = []portfolio.Transaction{}
	}
	httpx.JSON(w, http.StatusOK, txns)
}
