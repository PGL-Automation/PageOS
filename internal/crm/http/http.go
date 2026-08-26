// Package crmhttp exposes the CRM endpoints.
package crmhttp

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/crm"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct{ svc *crm.Service }

func New(svc *crm.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Get("/dashboard", h.dashboard)

	r.Get("/contacts", h.listContacts)
	r.Post("/contacts", h.createContact)
	r.Get("/contacts/{id}", h.getContact)
	r.Put("/contacts/{id}", h.updateContact)
	r.Patch("/contacts/{id}/stage", h.updateStage)
	r.Post("/contacts/{id}/convert", h.convertToClient)

	r.Get("/interactions", h.listInteractions)
	r.Post("/interactions", h.logInteraction)

	r.Get("/tasks", h.listTasks)
	r.Post("/tasks", h.createTask)
	r.Patch("/tasks/{id}/status", h.updateTaskStatus)
	r.Post("/tasks/{id}/complete", h.completeTask)

	r.Get("/opportunities", h.listOpportunities)
	r.Post("/opportunities", h.createOpportunity)
	r.Patch("/opportunities/{id}/stage", h.updateOpportunityStage)

	return r
}

func optUUID(s string) *uuid.UUID {
	if s == "" { return nil }
	id, err := uuid.Parse(s)
	if err != nil { return nil }
	return &id
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	caller, _ := identityhttp.UserFrom(r.Context())
	rmID := optUUID(r.URL.Query().Get("rm_person_id"))
	// Default to caller's own person_id if no filter given
	_ = caller
	stats, err := h.svc.GetDashboardStats(r.Context(), rmID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}

// ── Contacts ──────────────────────────────────────────────────────────────────

func (h *Handler) listContacts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	contacts, err := h.svc.ListContacts(r.Context(),
		optUUID(q.Get("rm_person_id")),
		optUUID(q.Get("subsidiary_id")),
		q.Get("type"), q.Get("stage"), q.Get("search"),
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if contacts == nil { contacts = []crm.Contact{} }
	httpx.JSON(w, http.StatusOK, contacts)
}

func (h *Handler) createContact(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	var in crm.CreateContactInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	c, err := h.svc.CreateContact(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, c)
}

func (h *Handler) getContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	c, err := h.svc.GetContact(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) updateContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in crm.CreateContactInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.svc.UpdateContact(r.Context(), id, in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	c, _ := h.svc.GetContact(r.Context(), id)
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) updateStage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct{ Stage string `json:"stage"` }
	json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.UpdateContactStage(r.Context(), id, body.Stage); err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"stage": body.Stage})
}

func (h *Handler) convertToClient(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct{ OnboardingClientID string `json:"onboarding_client_id"` }
	json.NewDecoder(r.Body).Decode(&body)
	clientID, err := uuid.Parse(body.OnboardingClientID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid onboarding_client_id")
		return
	}
	if err := h.svc.ConvertToClient(r.Context(), id, clientID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "convert_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "converted"})
}

// ── Interactions ──────────────────────────────────────────────────────────────

func (h *Handler) listInteractions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 50
	if l := q.Get("limit"); l != "" {
		if n, e := strconv.Atoi(l); e == nil { limit = n }
	}
	items, err := h.svc.ListInteractions(r.Context(), optUUID(q.Get("contact_id")), optUUID(q.Get("rm_person_id")), limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil { items = []crm.Interaction{} }
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) logInteraction(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	var in crm.LogInteractionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	item, err := h.svc.LogInteraction(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "log_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

func (h *Handler) listTasks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.ListTasks(r.Context(), optUUID(q.Get("assigned_to")), optUUID(q.Get("contact_id")), q.Get("status"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil { items = []crm.Task{} }
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) createTask(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	var in crm.CreateTaskInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	item, err := h.svc.CreateTask(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

func (h *Handler) updateTaskStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct{ Status string `json:"status"` }
	json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.UpdateTaskStatus(r.Context(), id, body.Status); err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": body.Status})
}

func (h *Handler) completeTask(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct{ Notes string `json:"notes"` }
	json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.CompleteTask(r.Context(), id, body.Notes); err != nil {
		httpx.Error(w, http.StatusBadRequest, "complete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "completed"})
}

// ── Opportunities ─────────────────────────────────────────────────────────────

func (h *Handler) listOpportunities(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.ListOpportunities(r.Context(), optUUID(q.Get("contact_id")), optUUID(q.Get("rm_person_id")), q.Get("stage"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil { items = []crm.Opportunity{} }
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) createOpportunity(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	var in crm.CreateOpportunityInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	item, err := h.svc.CreateOpportunity(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

func (h *Handler) updateOpportunityStage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		Stage      string `json:"stage"`
		LostReason string `json:"lost_reason"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.UpdateOpportunityStage(r.Context(), id, body.Stage, body.LostReason); err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"stage": body.Stage})
}
