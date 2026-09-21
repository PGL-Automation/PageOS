package portfoliohttp

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

// calculateNAV handles POST /funds/{id}/nav.
// Body (optional): {"nav_date": "YYYY-MM-DD"} — defaults to today.
func (h *Handler) calculateNAV(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	fundID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund id")
		return
	}

	var body struct {
		NavDate string `json:"nav_date"`
	}
	// Body is optional — ignore decode errors for empty bodies.
	_ = json.NewDecoder(r.Body).Decode(&body)

	navDate := time.Now().UTC()
	if body.NavDate != "" {
		parsed, err := time.Parse("2006-01-02", body.NavDate)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "nav_date must be YYYY-MM-DD")
			return
		}
		navDate = parsed
	}

	result, err := h.svc.CalculateNAV(r.Context(), fundID, navDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "nav_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// getNAVHistory handles GET /funds/{id}/nav.
// Query params: from (YYYY-MM-DD), to (YYYY-MM-DD).
// Both default to today when omitted.
func (h *Handler) getNAVHistory(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	fundID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund id")
		return
	}

	now := time.Now().UTC()
	from := now
	to := now

	q := r.URL.Query()
	if s := q.Get("from"); s != "" {
		parsed, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "from must be YYYY-MM-DD")
			return
		}
		from = parsed
	}
	if s := q.Get("to"); s != "" {
		parsed, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "to must be YYYY-MM-DD")
			return
		}
		to = parsed
	}

	results, err := h.svc.GetNAVHistory(r.Context(), fundID, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if results == nil {
		results = []portfolio.NAVResult{}
	}
	httpx.JSON(w, http.StatusOK, results)
}

// runAllNAVs handles POST /nav/run-all.
// Body (optional): {"nav_date": "YYYY-MM-DD"} — defaults to today.
// Intended for manual triggers and scheduled jobs.
func (h *Handler) runAllNAVs(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}

	var body struct {
		NavDate string `json:"nav_date"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	navDate := time.Now().UTC()
	if body.NavDate != "" {
		parsed, err := time.Parse("2006-01-02", body.NavDate)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "nav_date must be YYYY-MM-DD")
			return
		}
		navDate = parsed
	}

	results, err := h.svc.RunAllNAVs(r.Context(), navDate)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "nav_run_all_failed", err.Error())
		return
	}
	if results == nil {
		results = []portfolio.NAVResult{}
	}
	httpx.JSON(w, http.StatusOK, results)
}
