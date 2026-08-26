// Package hrhttp exposes HR leave management over HTTP.
package hrhttp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/hr"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// Handler exposes HR leave management endpoints.
type Handler struct {
	svc  *hr.Service
	pool *pgxpool.Pool
}

func New(svc *hr.Service, pool *pgxpool.Pool) *Handler {
	return &Handler{svc: svc, pool: pool}
}

// Routes registers all leave management endpoints. authMW guards every route.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Get("/leave/policies", h.listPolicies)

	r.Post("/leave/requests", h.createRequest)
	r.Get("/leave/requests", h.listRequests)
	r.Post("/leave/requests/{id}/approve", h.approveRequest)
	r.Post("/leave/requests/{id}/reject", h.rejectRequest)
	r.Post("/leave/requests/{id}/cancel", h.cancelRequest)

	r.Get("/leave/balance", h.getOwnBalance)
	r.Get("/leave/balance/{personId}", h.getPersonBalance)

	// Document requests
	r.Get("/document-requests/types", h.listDocumentTypes)
	r.Post("/document-requests", h.createDocumentRequest)
	r.Get("/document-requests", h.listDocumentRequests)        // HR: all; employee: pass ?person_id=me
	r.Get("/document-requests/my", h.myDocumentRequests)       // Employee: own requests
	r.Post("/document-requests/{id}/fulfill", h.fulfillDocumentRequest)
	r.Post("/document-requests/{id}/decline", h.declineDocumentRequest)
	r.Post("/document-requests/{id}/remind", h.remindDocumentRequest)

	return r
}

// personIDFromUserID resolves the organization.person.id for a given identity.users.id.
func (h *Handler) personIDFromUserID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var personID uuid.UUID
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM organization.person WHERE user_id = $1 LIMIT 1`, userID,
	).Scan(&personID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, errors.New("no person record found for this user")
	}
	return personID, err
}

// ── Policies ──────────────────────────────────────────────────────────────────

func (h *Handler) listPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := h.svc.ListPolicies(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if policies == nil {
		policies = []hr.LeavePolicy{}
	}
	httpx.JSON(w, http.StatusOK, policies)
}

// ── Requests ──────────────────────────────────────────────────────────────────

func (h *Handler) createRequest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PersonIDStr            string  `json:"person_id"`
		PolicyIDStr            string  `json:"policy_id"`
		StartDate              string  `json:"start_date"`
		EndDate                string  `json:"end_date"`
		DaysCount              float64 `json:"days_count"`
		Notes                  string  `json:"notes"`
		RelieverPersonIDStr    string  `json:"reliever_person_id"`
		HandoverDocumentIDStr  string  `json:"handover_document_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	var personID uuid.UUID
	if in.PersonIDStr != "" {
		pid, err := uuid.Parse(in.PersonIDStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person_id")
			return
		}
		personID = pid
	} else {
		// No person_id supplied — use the caller's own person record.
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		pid, err := h.personIDFromUserID(r.Context(), caller.ID)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "no_person_record", err.Error())
			return
		}
		personID = pid
	}

	policyID, err := uuid.Parse(in.PolicyIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "policy_id is required")
		return
	}
	if in.StartDate == "" || in.EndDate == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "start_date and end_date are required")
		return
	}
	if in.DaysCount <= 0 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "days_count must be greater than 0")
		return
	}

	var relieverPersonID *uuid.UUID
	if in.RelieverPersonIDStr != "" {
		pid, parseErr := uuid.Parse(in.RelieverPersonIDStr)
		if parseErr != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid reliever_person_id")
			return
		}
		relieverPersonID = &pid
	}

	var handoverDocumentID *uuid.UUID
	if in.HandoverDocumentIDStr != "" {
		did, parseErr := uuid.Parse(in.HandoverDocumentIDStr)
		if parseErr != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid handover_document_id")
			return
		}
		handoverDocumentID = &did
	}

	req, err := h.svc.CreateRequest(r.Context(), hr.CreateLeaveInput{
		PersonID:           personID,
		PolicyID:           policyID,
		StartDate:          in.StartDate,
		EndDate:            in.EndDate,
		DaysCount:          in.DaysCount,
		Notes:              in.Notes,
		RelieverPersonID:   relieverPersonID,
		HandoverDocumentID: handoverDocumentID,
	})
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, req)
}

func (h *Handler) listRequests(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")

	var personID *uuid.UUID
	if pidStr := q.Get("person_id"); pidStr != "" {
		pid, err := uuid.Parse(pidStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person_id")
			return
		}
		personID = &pid
	}

	requests, err := h.svc.ListRequests(r.Context(), personID, status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if requests == nil {
		requests = []hr.LeaveRequest{}
	}
	httpx.JSON(w, http.StatusOK, requests)
}

func (h *Handler) approveRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewRequest(w, r, "approve")
}
func (h *Handler) rejectRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewRequest(w, r, "reject")
}
func (h *Handler) cancelRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewRequest(w, r, "cancel")
}

func (h *Handler) reviewRequest(w http.ResponseWriter, r *http.Request, action string) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	reqID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid request id")
		return
	}

	var body struct {
		ReviewerNote     string `json:"reviewer_note"`
		ReviewerPersonID string `json:"reviewer_person_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Resolve reviewer person_id — explicit override or caller's own.
	var reviewerPersonID uuid.UUID
	if body.ReviewerPersonID != "" {
		if pid, parseErr := uuid.Parse(body.ReviewerPersonID); parseErr == nil {
			reviewerPersonID = pid
		}
	}
	if reviewerPersonID == uuid.Nil {
		pid, lookupErr := h.personIDFromUserID(r.Context(), caller.ID)
		if lookupErr != nil {
			httpx.Error(w, http.StatusBadRequest, "no_person_record", "reviewer has no person record")
			return
		}
		reviewerPersonID = pid
	}

	if err := h.svc.ReviewRequest(r.Context(), hr.ReviewInput{
		RequestID:        reqID,
		ReviewerPersonID: reviewerPersonID,
		Action:           action,
		ReviewerNote:     body.ReviewerNote,
	}); err != nil {
		httpx.Error(w, http.StatusBadRequest, "review_failed", err.Error())
		return
	}
	newStatus := map[string]string{
		"approve": "approved", "reject": "rejected", "cancel": "cancelled",
	}[action]
	httpx.JSON(w, http.StatusOK, map[string]string{"status": newStatus})
}

// ── Balance ───────────────────────────────────────────────────────────────────

func (h *Handler) getOwnBalance(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	personID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person_record", err.Error())
		return
	}
	year := time.Now().Year()
	if y := r.URL.Query().Get("year"); y != "" {
		if parsed, parseErr := strconv.Atoi(y); parseErr == nil {
			year = parsed
		}
	}
	balances, err := h.svc.GetBalance(r.Context(), personID, year)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if balances == nil {
		balances = []hr.LeaveBalance{}
	}
	httpx.JSON(w, http.StatusOK, balances)
}

func (h *Handler) getPersonBalance(w http.ResponseWriter, r *http.Request) {
	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person id")
		return
	}
	year := time.Now().Year()
	if y := r.URL.Query().Get("year"); y != "" {
		if parsed, parseErr := strconv.Atoi(y); parseErr == nil {
			year = parsed
		}
	}
	balances, err := h.svc.GetBalance(r.Context(), personID, year)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if balances == nil {
		balances = []hr.LeaveBalance{}
	}
	httpx.JSON(w, http.StatusOK, balances)
}

// ── Document requests ─────────────────────────────────────────────────────────

func (h *Handler) listDocumentTypes(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, hr.CommonDocumentTypes)
}

func (h *Handler) createDocumentRequest(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	callerPersonID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person", "caller has no person record")
		return
	}
	var in hr.CreateDocumentRequestInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req, err := h.svc.CreateDocumentRequest(r.Context(), in, callerPersonID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, req)
}

func (h *Handler) listDocumentRequests(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var personID *uuid.UUID
	if s := q.Get("person_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person_id")
			return
		}
		personID = &id
	}
	status := q.Get("status")
	reqs, err := h.svc.ListDocumentRequests(r.Context(), personID, status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if reqs == nil {
		reqs = []hr.DocumentRequest{}
	}
	httpx.JSON(w, http.StatusOK, reqs)
}

func (h *Handler) myDocumentRequests(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	personID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.JSON(w, http.StatusOK, []hr.DocumentRequest{})
		return
	}
	status := r.URL.Query().Get("status")
	reqs, err := h.svc.ListDocumentRequests(r.Context(), &personID, status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if reqs == nil {
		reqs = []hr.DocumentRequest{}
	}
	httpx.JSON(w, http.StatusOK, reqs)
}

func (h *Handler) fulfillDocumentRequest(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	personID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person", "caller has no person record")
		return
	}
	var body struct {
		DocumentID uuid.UUID `json:"document_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.svc.FulfillDocumentRequest(r.Context(), requestID, body.DocumentID, personID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "fulfill_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "uploaded"})
}

func (h *Handler) declineDocumentRequest(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	personID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person", "caller has no person record")
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.DeclineDocumentRequest(r.Context(), requestID, personID, body.Note); err != nil {
		httpx.Error(w, http.StatusBadRequest, "decline_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "declined"})
}

func (h *Handler) remindDocumentRequest(w http.ResponseWriter, r *http.Request) {
	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.SendReminder(r.Context(), requestID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "remind_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
