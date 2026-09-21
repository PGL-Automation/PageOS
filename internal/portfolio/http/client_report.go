// Package portfoliohttp exposes investment portfolio management over HTTP.
package portfoliohttp

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// getClientReport handles GET /accounts/{id}/report.
// Query params: from, to (YYYY-MM-DD). Defaults to the last 12 months.
func (h *Handler) getClientReport(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	from, to, ok := parseDateRange(w, r)
	if !ok {
		return
	}

	report, err := h.svc.GetClientReport(r.Context(), id, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, report)
}

// exportClientReport handles GET /accounts/{id}/report/export.
// Query params: from, to (YYYY-MM-DD). Defaults to the last 12 months.
// Returns an Excel workbook as an attachment.
func (h *Handler) exportClientReport(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	from, to, ok := parseDateRange(w, r)
	if !ok {
		return
	}

	data, filename, err := h.svc.ExportClientReportExcel(r.Context(), id, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "export_failed", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// parseDateRange reads ?from= and ?to= query params (YYYY-MM-DD).
// If absent, defaults to the last 12 months. Returns (from, to, ok).
func parseDateRange(w http.ResponseWriter, r *http.Request) (time.Time, time.Time, bool) {
	q := r.URL.Query()
	to := time.Now()
	from := to.AddDate(-1, 0, 0)

	if s := q.Get("from"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid from date; expected YYYY-MM-DD")
			return time.Time{}, time.Time{}, false
		}
		from = t
	}

	if s := q.Get("to"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid to date; expected YYYY-MM-DD")
			return time.Time{}, time.Time{}, false
		}
		to = t
	}

	return from, to, true
}
