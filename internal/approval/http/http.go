// Package approvalhttp exposes the approval capabilities over HTTP.
package approvalhttp

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/approval"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct {
	svc *approval.Service
}

func New(svc *approval.Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Get("/queue", h.getQueue)
	r.Get("/requests/{id}", h.getRequest)
	r.Post("/requests/{id}/steps/{stepId}/decide", h.decide)
	return r
}

// getQueue returns pending approval steps for the authenticated user.
func (h *Handler) getQueue(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	items, err := h.svc.GetQueue(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []approval.QueueItem{}
	}
	httpx.JSON(w, http.StatusOK, items)
}

// getRequest returns a full approval request with its steps.
func (h *Handler) getRequest(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid request id")
		return
	}
	details, err := h.svc.GetRequest(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "approval request not found")
		return
	}
	httpx.JSON(w, http.StatusOK, details)
}

// decide records an approve / reject / return decision on a step.
func (h *Handler) decide(w http.ResponseWriter, r *http.Request) {
	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid request id")
		return
	}
	stepID, err := uuid.Parse(chi.URLParam(r, "stepId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid step id")
		return
	}

	var in struct {
		Action string `json:"action"` // "approve" | "reject" | "return"
		Notes  string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	var action approval.Action
	switch in.Action {
	case "approve":
		action = approval.ActionApprove
	case "reject":
		action = approval.ActionReject
	case "return":
		action = approval.ActionReturn
	default:
		httpx.Error(w, http.StatusBadRequest, "bad_request", "action must be approve, reject, or return")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	if err := h.svc.RecordDecision(r.Context(), requestID, stepID, user.ID, action, in.Notes); err != nil {
		switch err {
		case approval.ErrUnauthorized:
			httpx.Error(w, http.StatusForbidden, "forbidden", "you do not hold the required position for this step")
		case approval.ErrStepNotPending:
			httpx.Error(w, http.StatusConflict, "step_not_pending", "this step has already been decided")
		default:
			httpx.Error(w, http.StatusBadRequest, "decide_failed", err.Error())
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "recorded"})
}
