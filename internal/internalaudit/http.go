package internalaudit

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// Handler exposes the internal-audit service over HTTP.
type Handler struct {
	svc *Service
}

// NewHandler returns a new Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Routes wires all internal-audit endpoints onto a chi router and returns it.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Get("/dashboard", h.getDashboard)

	r.Get("/review-items", h.listReviewItems)
	r.Post("/review-items", h.createReviewItem)
	r.Get("/review-items/{id}", h.getReviewItem)
	r.Post("/review-items/{id}/action", h.takeAction)
	r.Post("/review-items/{id}/assign", h.assignReviewer)

	r.Get("/review-items/{id}/documents", h.listDocuments)
	r.Post("/review-items/{id}/documents", h.addDocument)

	r.Get("/review-items/{id}/checklist", h.getChecklist)
	r.Post("/review-items/{id}/checklist/seed", h.seedChecklist)
	r.Patch("/review-items/{id}/checklist/{cid}", h.updateChecklistItem)

	r.Get("/review-items/{id}/actions", h.getActions)

	r.Get("/review-items/{id}/exceptions", h.listExceptions)
	r.Post("/review-items/{id}/exceptions", h.createException)

	r.Patch("/exceptions/{eid}", h.updateException)

	return r
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

func (h *Handler) getDashboard(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetDashboardStats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}

// ── Review Items ──────────────────────────────────────────────────────────────

func (h *Handler) listReviewItems(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.ListReviewItems(
		r.Context(),
		q.Get("status"),
		q.Get("business_unit"),
		q.Get("risk_level"),
		q.Get("search"),
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []ReviewItem{}
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) createReviewItem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title                string     `json:"title"`
		ItemType             string     `json:"item_type"`
		BusinessUnit         string     `json:"business_unit"`
		RiskLevel            string     `json:"risk_level"`
		Priority             string     `json:"priority"`
		DueDate              *time.Time `json:"due_date"`
		Description          string     `json:"description"`
		Instructions         string     `json:"instructions"`
		ComplianceRequired   bool       `json:"compliance_required"`
		LinkedClientRef      string     `json:"linked_client_ref"`
		LinkedTransactionRef string     `json:"linked_transaction_ref"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var submitterID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		submitterID = &user.ID
	}

	item, err := h.svc.CreateReviewItem(
		r.Context(),
		in.Title, in.ItemType, in.BusinessUnit, in.RiskLevel, in.Priority,
		in.DueDate, in.Description, in.Instructions, in.ComplianceRequired,
		in.LinkedClientRef, in.LinkedTransactionRef,
		submitterID, user.DisplayName,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

func (h *Handler) getReviewItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	item, err := h.svc.GetReviewItem(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "review item not found")
		return
	}
	httpx.JSON(w, http.StatusOK, item)
}

func (h *Handler) takeAction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Action   string `json:"action"`
		Comments string `json:"comments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	if in.Action == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "action is required")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var actorID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		actorID = &user.ID
	}

	item, err := h.svc.TakeAction(r.Context(), id, in.Action, in.Comments, actorID, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "action_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, item)
}

func (h *Handler) assignReviewer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		ReviewerName string `json:"reviewer_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var actorID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		actorID = &user.ID
	}

	if err := h.svc.AssignReviewer(r.Context(), id, in.ReviewerName, actorID, user.DisplayName); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

// ── Documents ─────────────────────────────────────────────────────────────────

func (h *Handler) listDocuments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	docs, err := h.svc.ListDocuments(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if docs == nil {
		docs = []ReviewDocument{}
	}
	httpx.JSON(w, http.StatusOK, docs)
}

func (h *Handler) addDocument(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		FileName     string `json:"file_name"`
		DocumentType string `json:"document_type"`
		Notes        string `json:"notes"`
		FileSize     int64  `json:"file_size"`
		ContentType  string `json:"content_type"`
		UploaderName string `json:"uploader_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var uploaderID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		uploaderID = &user.ID
	}
	uploaderName := in.UploaderName
	if uploaderName == "" {
		uploaderName = user.DisplayName
	}

	doc, err := h.svc.AddDocument(r.Context(), id, in.FileName, in.DocumentType, uploaderName, in.FileSize, in.ContentType, in.Notes, uploaderID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, doc)
}

// ── Checklist ─────────────────────────────────────────────────────────────────

func (h *Handler) getChecklist(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	items, err := h.svc.GetChecklist(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []ChecklistItem{}
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) seedChecklist(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Look up item_type from the review item.
	item, err := h.svc.GetReviewItem(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "review item not found")
		return
	}

	if err := h.svc.SeedChecklist(r.Context(), id, item.ItemType); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "seeded"})
}

func (h *Handler) updateChecklistItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := chi.URLParam(r, "cid")
	var in struct {
		Status          string `json:"status"`
		ReviewerComments string `json:"reviewer_comments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var validatorID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		validatorID = &user.ID
	}

	ci, err := h.svc.UpdateChecklistItem(r.Context(), cid, id, in.Status, in.ReviewerComments, validatorID, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, ci)
}

// ── Actions ───────────────────────────────────────────────────────────────────

func (h *Handler) getActions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actions, err := h.svc.GetActions(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if actions == nil {
		actions = []ReviewAction{}
	}
	httpx.JSON(w, http.StatusOK, actions)
}

// ── Exceptions ────────────────────────────────────────────────────────────────

func (h *Handler) listExceptions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	excs, err := h.svc.ListExceptions(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if excs == nil {
		excs = []ReviewException{}
	}
	httpx.JSON(w, http.StatusOK, excs)
}

func (h *Handler) createException(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Title            string     `json:"title"`
		Description      string     `json:"description"`
		Severity         string     `json:"severity"`
		OwnerName        string     `json:"owner_name"`
		CorrectiveAction string     `json:"corrective_action"`
		DueDate          *time.Time `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	var raisedByID *uuid.UUID
	if user.ID != (uuid.UUID{}) {
		raisedByID = &user.ID
	}

	exc, err := h.svc.CreateException(
		r.Context(), id, in.Title, in.Description, in.Severity,
		in.OwnerName, in.CorrectiveAction, in.DueDate, raisedByID, user.DisplayName,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, exc)
}

func (h *Handler) updateException(w http.ResponseWriter, r *http.Request) {
	eid := chi.URLParam(r, "eid")
	var in struct {
		Status           string `json:"status"`
		CorrectiveAction string `json:"corrective_action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}

	if err := h.svc.UpdateException(r.Context(), eid, in.Status, in.CorrectiveAction); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}
