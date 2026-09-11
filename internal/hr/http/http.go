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

// hrPositionCodes is the canonical set of position codes that have HR module access.
// Add new HR/HC position codes here — nowhere else.
var hrPositionCodes = []string{
	"HR_MANAGER", "HR_OFFICER", "HR_OPS_MANAGER", "HR_ADMIN",
	"HEAD_HR", "HEAD_HUMAN_CAPITAL",
	"HC_OFFICER", "HC_MANAGER",
	"GROUP_ADMIN",
}

// hrIdentityRoles is the canonical set of identity.users.role values that have HR access.
var hrIdentityRoles = []string{
	"hr_admin", "hr_manager", "hr_officer", "group_admin", "admin",
}

// isHROrAdmin returns true if the user holds an HR position or group-admin role.
// Uses explicit allowlists — no substring matching.
func (h *Handler) isHROrAdmin(ctx context.Context, userID uuid.UUID) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM identity.users u
			LEFT JOIN organization.person   per ON per.user_id = u.id
			LEFT JOIN organization.assignment a ON a.person_id = per.id
			              AND a.effective_from <= CURRENT_DATE
			              AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			LEFT JOIN organization.position pos ON pos.id = a.position_id
			WHERE u.id = $1
			  AND (
			      pos.code = ANY($2::text[])
			      OR LOWER(COALESCE(u.role,'')) = ANY($3::text[])
			  )
		)
	`
	var exists bool
	if err := h.pool.QueryRow(ctx, q, userID, hrPositionCodes, hrIdentityRoles).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

// ── Policies ──────────────────────────────────────────────────────────────────

func (h *Handler) listPolicies(w http.ResponseWriter, r *http.Request) {
	// Resolve the caller's person ID for grade-based policy filtering.
	// If resolution fails (no person record), all policies are returned.
	var personID *uuid.UUID
	if caller, ok := identityhttp.UserFrom(r.Context()); ok {
		var pid uuid.UUID
		if err := h.pool.QueryRow(r.Context(),
			`SELECT id FROM organization.person WHERE user_id = $1 LIMIT 1`, caller.ID,
		).Scan(&pid); err == nil {
			personID = &pid
		}
	}
	policies, err := h.svc.ListPolicies(r.Context(), personID)
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
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

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

	// Resolve the caller's own person ID (always needed for authorization).
	callerPersonID, err := h.personIDFromUserID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person_record", err.Error())
		return
	}

	var personID uuid.UUID
	if in.PersonIDStr != "" {
		pid, parseErr := uuid.Parse(in.PersonIDStr)
		if parseErr != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person_id")
			return
		}
		// FIX 4: If person_id differs from the caller's own, require HR/admin.
		if pid != callerPersonID {
			isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
			if roleErr != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
				return
			}
			if !isHR {
				httpx.Error(w, http.StatusForbidden, "forbidden", "only HR or admin may create leave on behalf of another employee")
				return
			}
		}
		personID = pid
	} else {
		personID = callerPersonID
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
	// FIX 2: Non-HR callers may only see their own requests.
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	isHR, err := h.isHROrAdmin(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	callerPersonID, personErr := h.personIDFromUserID(r.Context(), caller.ID)
	if personErr != nil && !isHR {
		httpx.Error(w, http.StatusBadRequest, "no_person_record", personErr.Error())
		return
	}

	q := r.URL.Query()
	status := q.Get("status")

	var personID *uuid.UUID
	if pidStr := q.Get("person_id"); pidStr != "" {
		pid, parseErr := uuid.Parse(pidStr)
		if parseErr != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person_id")
			return
		}
		// Non-HR users cannot filter by a different person's ID.
		if !isHR && pid != callerPersonID {
			httpx.Error(w, http.StatusForbidden, "forbidden", "you may only view your own leave requests")
			return
		}
		personID = &pid
	} else if !isHR {
		// Non-HR: force filter to caller's own records.
		personID = &callerPersonID
	}

	// Resolve the caller's subsidiary and position code to apply scoping.
	// GROUP_ADMIN (or equivalent) can see all subsidiaries; everyone else is
	// scoped to their own subsidiary via their primary active assignment.
	var subsidiaryID *uuid.UUID
	var posCode string
	_ = h.pool.QueryRow(r.Context(), `
		SELECT a.subsidiary_id, COALESCE(pos.code, '')
		FROM   organization.person per
		JOIN   organization.assignment a   ON a.person_id    = per.id
		                                  AND a.is_primary   = true
		                                  AND a.effective_to IS NULL
		JOIN   organization.position   pos ON pos.id         = a.position_id
		WHERE  per.user_id = $1
		LIMIT  1
	`, caller.ID).Scan(&subsidiaryID, &posCode)

	// GROUP_ADMIN sees across all subsidiaries — pass nil to skip subsidiary filter.
	if posCode == "GROUP_ADMIN" {
		subsidiaryID = nil
	}

	requests, err := h.svc.ListRequests(r.Context(), personID, status, subsidiaryID)
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

	// Only accept reviewer_note from the body — reviewer_person_id is always
	// resolved from the authenticated caller to prevent self-approval bypass.
	var body struct {
		ReviewerNote string `json:"reviewer_note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Resolve reviewer person_id strictly from the authenticated caller.
	reviewerPersonID, lookupErr := h.personIDFromUserID(r.Context(), caller.ID)
	if lookupErr != nil {
		httpx.Error(w, http.StatusBadRequest, "no_person_record", "reviewer has no person record")
		return
	}

	// FIX 1a: approve and reject require HR/admin role.
	// cancel is permitted for any authenticated user (employee cancelling own request
	// is validated at the DB level via status=pending check in ReviewRequest).
	if action == "approve" || action == "reject" {
		isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
		if roleErr != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
			return
		}
		if !isHR {
			httpx.Error(w, http.StatusForbidden, "forbidden", "only HR or admin may approve or reject leave requests")
			return
		}
	}

	// FIX 1b: Anti-self-approval — reviewer must not be the requester.
	if action == "approve" || action == "reject" {
		var requesterPersonID uuid.UUID
		lookupErr := h.pool.QueryRow(r.Context(),
			`SELECT person_id FROM hr.leave_request WHERE id = $1`, reqID,
		).Scan(&requesterPersonID)
		if lookupErr != nil {
			httpx.Error(w, http.StatusBadRequest, "not_found", "leave request not found")
			return
		}
		if requesterPersonID == reviewerPersonID {
			httpx.Error(w, http.StatusForbidden, "forbidden", "you may not approve or reject your own leave request")
			return
		}
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
	// FIX 3: Only allow if caller is HR/admin OR caller's own personID matches.
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid person id")
		return
	}

	isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
	if roleErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
		return
	}

	if !isHR {
		callerPersonID, personErr := h.personIDFromUserID(r.Context(), caller.ID)
		if personErr != nil || callerPersonID != personID {
			httpx.Error(w, http.StatusForbidden, "forbidden", "you may only view your own leave balance")
			return
		}
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
	// FIX 5: createDocumentRequest requires HR/admin.
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
	if roleErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
		return
	}
	if !isHR {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only HR or admin may create document requests")
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
	// FIX 5: listDocumentRequests requires HR/admin.
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
	if roleErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
		return
	}
	if !isHR {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only HR or admin may list all document requests")
		return
	}

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
	// FIX 5: remindDocumentRequest requires HR/admin.
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	isHR, roleErr := h.isHROrAdmin(r.Context(), caller.ID)
	if roleErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", roleErr.Error())
		return
	}
	if !isHR {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only HR or admin may send document reminders")
		return
	}

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
