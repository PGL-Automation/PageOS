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

// ── Compliance rules ───────────────────────────────────────────────────────────

func (h *Handler) createComplianceRule(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.CreateComplianceRuleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	rule, err := h.svc.CreateComplianceRule(r.Context(), in, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rule)
}

func (h *Handler) listComplianceRules(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	s := r.URL.Query().Get("fund_id")
	if s == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(s)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	rules, err := h.svc.ListComplianceRules(r.Context(), fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rules == nil {
		rules = []portfolio.ComplianceRule{}
	}
	httpx.JSON(w, http.StatusOK, rules)
}

func (h *Handler) deleteComplianceRule(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.DeleteComplianceRule(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Compliance checks ──────────────────────────────────────────────────────────

func (h *Handler) checkCompliance(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	s := r.URL.Query().Get("fund_id")
	if s == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "fund_id is required")
		return
	}
	fundID, err := uuid.Parse(s)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
		return
	}
	result, err := h.svc.CheckCompliance(r.Context(), fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "check_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// ── Compliance breaches ────────────────────────────────────────────────────────

func (h *Handler) listBreaches(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	q := r.URL.Query()
	var fundID *uuid.UUID
	if s := q.Get("fund_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
			return
		}
		fundID = &id
	}
	breaches, err := h.svc.ListBreaches(r.Context(), fundID, q.Get("status"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if breaches == nil {
		breaches = []portfolio.ComplianceBreach{}
	}
	httpx.JSON(w, http.StatusOK, breaches)
}

func (h *Handler) acknowledgeBreach(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.AcknowledgeBreach(r.Context(), id, caller.ID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "acknowledge_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
}

func (h *Handler) resolveBreach(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		ResolutionNotes string `json:"resolution_notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.svc.ResolveBreach(r.Context(), id, body.ResolutionNotes, caller.ID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "resolve_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "resolved"})
}
