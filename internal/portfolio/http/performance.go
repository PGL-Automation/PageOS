package portfoliohttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

func (h *Handler) calculatePerformance(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "1y"
	}
	metrics, err := h.svc.CalculatePerformance(r.Context(), id, period)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, metrics)
}

func (h *Handler) getPerformanceHistory(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	history, err := h.svc.GetPerformanceHistory(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if history == nil {
		history = []portfolio.PerformanceMetrics{}
	}
	httpx.JSON(w, http.StatusOK, history)
}

func (h *Handler) getClientPerformance(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	clients, err := h.svc.GetClientPerformance(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if clients == nil {
		clients = []portfolio.ClientPerformance{}
	}
	httpx.JSON(w, http.StatusOK, clients)
}
