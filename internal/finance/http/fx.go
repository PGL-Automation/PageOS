package financehttp

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/pagegroup/pageos/internal/finance"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// ── FX Rates ──────────────────────────────────────────────────────────────────

func (h *Handler) setFXRate(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requireFinanceStaff(w, r)
	if !ok {
		return
	}

	var body struct {
		FromCurrency string  `json:"from_currency"`
		ToCurrency   string  `json:"to_currency"`
		RateDate     string  `json:"rate_date"`
		Rate         float64 `json:"rate"`
		Source       string  `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.RateDate == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "rate_date is required")
		return
	}
	rateDate, err := time.Parse("2006-01-02", body.RateDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "rate_date must be YYYY-MM-DD")
		return
	}

	in := finance.SetFXRateInput{
		FromCurrency: body.FromCurrency,
		ToCurrency:   body.ToCurrency,
		RateDate:     rateDate,
		Rate:         body.Rate,
		Source:       body.Source,
	}
	rate, err := h.svc.SetFXRate(r.Context(), in, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "set_fx_rate_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rate)
}

func (h *Handler) listFXRates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	from := time.Time{}
	to := time.Time{}

	if s := q.Get("from"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "from must be YYYY-MM-DD")
			return
		}
		from = t
	}
	if s := q.Get("to"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "to must be YYYY-MM-DD")
			return
		}
		to = t
	}

	rates, err := h.svc.ListFXRates(r.Context(), q.Get("from_currency"), q.Get("to_currency"), from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rates == nil {
		rates = []finance.FXRate{}
	}
	httpx.JSON(w, http.StatusOK, rates)
}

func (h *Handler) getLatestFXRate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fromCurrency := q.Get("from_currency")
	toCurrency := q.Get("to_currency")
	if fromCurrency == "" || toCurrency == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "from_currency and to_currency are required")
		return
	}

	rate, err := h.svc.GetFXRate(r.Context(), fromCurrency, toCurrency, time.Now())
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"from_currency": fromCurrency,
		"to_currency":   toCurrency,
		"rate":          rate,
	})
}
