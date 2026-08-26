// Package payrollhttp exposes payroll run management over HTTP.
package payrollhttp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/payroll"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct {
	svc *payroll.Service
}

func New(svc *payroll.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Get("/runs", h.listRuns)
	r.Post("/runs", h.initiateRun)
	r.Get("/runs/{id}", h.getRun)
	r.Post("/runs/{id}/approve", h.approveRun)
	r.Get("/runs/{id}/paye-schedule", h.payeSchedule)
	r.Get("/runs/{id}/pension-schedule", h.pensionSchedule)

	// Remittance tracking
	r.Get("/remittances", h.remittanceDashboard)
	r.Post("/remittances", h.recordRemittance)

	return r
}

func (h *Handler) listRuns(w http.ResponseWriter, r *http.Request) {
	var subID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	runs, err := h.svc.ListRuns(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if runs == nil {
		runs = []payroll.Run{}
	}
	httpx.JSON(w, http.StatusOK, runs)
}

func (h *Handler) initiateRun(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var in struct {
		SubsidiaryID *uuid.UUID `json:"subsidiary_id"`
		Year         int        `json:"year"`
		Month        int        `json:"month"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if in.Year == 0 {
		in.Year = time.Now().Year()
	}
	if in.Month == 0 {
		in.Month = int(time.Now().Month())
	}

	run, err := h.svc.InitiateRun(r.Context(), in.SubsidiaryID, in.Year, in.Month, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "initiate_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, run)
}

func (h *Handler) getRun(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	run, err := h.svc.GetRunWithPayslips(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, run)
}

func (h *Handler) approveRun(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	run, err := h.svc.ApproveRun(r.Context(), id, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "approve_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, run)
}

func (h *Handler) payeSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	run, err := h.svc.GetRunWithPayslips(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	schedule, err := h.svc.GetPAYESchedule(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	if r.URL.Query().Get("format") == "json" {
		httpx.JSON(w, http.StatusOK, schedule)
		return
	}

	csv := payroll.PAYEScheduleCSV(schedule, run.PeriodName, run.SubsidiaryName)
	filename := fmt.Sprintf("paye-%s-%d-%02d.csv", run.SubsidiaryName, run.PeriodYear, run.PeriodMonth)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(csv))
}

func (h *Handler) pensionSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	run, err := h.svc.GetRunWithPayslips(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	schedule, err := h.svc.GetPensionSchedule(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	if r.URL.Query().Get("format") == "json" {
		httpx.JSON(w, http.StatusOK, schedule)
		return
	}

	csv := payroll.PensionScheduleCSV(schedule, run.PeriodName, run.SubsidiaryName)
	filename := fmt.Sprintf("pension-%s-%d-%02d.csv", run.SubsidiaryName, run.PeriodYear, run.PeriodMonth)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(csv))
}

// ── Remittance ────────────────────────────────────────────────────────────────

func (h *Handler) remittanceDashboard(w http.ResponseWriter, r *http.Request) {
	var subID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	rows, err := h.svc.ListRemittanceDashboard(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []payroll.RunRemittanceSummary{}
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *Handler) recordRemittance(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	var in payroll.RecordRemittanceInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	rem, err := h.svc.RecordRemittance(r.Context(), in, user.ID, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "record_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rem)
}
