// Package onboardinghttp exposes the onboarding capabilities over HTTP.
package onboardinghttp

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/documents"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/onboarding"
	"github.com/pagegroup/pageos/internal/onboarding/domain"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const maxDocUpload = 20 << 20 // 20 MB

// Handler wires HTTP to the onboarding service.
type Handler struct {
	svc    *onboarding.Service
	docSvc *documents.Service
}

func New(svc *onboarding.Service, docSvc *documents.Service) *Handler {
	return &Handler{svc: svc, docSvc: docSvc}
}

// Routes returns the onboarding router, protected by authMW.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Clients
	r.Post("/clients", h.createClient)
	r.Get("/clients", h.listClients)
	r.Get("/clients/{id}", h.getClient)
	r.Post("/clients/{id}/rm", h.assignRM)
	r.Delete("/clients/{id}/rm", h.unassignRM)

	// Cases
	r.Post("/cases", h.createCase)
	r.Get("/cases", h.listCases)
	r.Get("/cases/{id}", h.getCase)
	r.Put("/cases/{id}/application", h.saveApplicationData)
	r.Get("/cases/{id}/requirements", h.listRequirements)
	r.Post("/cases/{id}/documents", h.uploadDocument)
	r.Post("/cases/{id}/submit", h.submitCase)
	r.Post("/cases/{id}/compliance", h.recordComplianceCheck)
	r.Get("/cases/{id}/compliance", h.listComplianceChecks)
	r.Post("/cases/{id}/approve", h.approveCase)
	r.Post("/cases/{id}/reject", h.rejectCase)
	r.Post("/cases/{id}/return", h.returnCase)
	r.Post("/cases/{id}/reopen", h.reopenCase)

	return r
}

// ── Clients ──────────────────────────────────────────────────────────────────

func (h *Handler) createClient(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID uuid.UUID  `json:"subsidiary_id"`
		ClientType   string     `json:"client_type"`
		DisplayName  string     `json:"display_name"`
		BrokerID     *uuid.UUID `json:"broker_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.ClientType == "" {
		in.ClientType = "individual"
	}
	c, err := h.svc.CreateClient(r.Context(), in.SubsidiaryID, in.ClientType, in.DisplayName, in.BrokerID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, c)
}

func (h *Handler) listClients(w http.ResponseWriter, r *http.Request) {
	sid, err := uuid.Parse(r.URL.Query().Get("subsidiary_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	clients, err := h.svc.ListClients(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, clients)
}

func (h *Handler) getClient(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid client id")
		return
	}
	c, err := h.svc.GetClient(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "client not found")
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) assignRM(w http.ResponseWriter, r *http.Request) {
	clientID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid client id")
		return
	}
	var in struct {
		RMPersonID   uuid.UUID `json:"rm_person_id"`
		SubsidiaryID uuid.UUID `json:"subsidiary_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	rm, err := h.svc.AssignRM(r.Context(), clientID, in.RMPersonID, in.SubsidiaryID, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "assign_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, rm)
}

func (h *Handler) unassignRM(w http.ResponseWriter, r *http.Request) {
	clientID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid client id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	if err := h.svc.UnassignRM(r.Context(), clientID, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "unassigned"})
}

// ── Cases ────────────────────────────────────────────────────────────────────

func (h *Handler) createCase(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ClientID uuid.UUID `json:"client_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.CreateCase(r.Context(), in.ClientID, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, c)
}

func (h *Handler) listCases(w http.ResponseWriter, r *http.Request) {
	sid, err := uuid.Parse(r.URL.Query().Get("subsidiary_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	state := r.URL.Query().Get("state")
	cases, err := h.svc.ListCases(r.Context(), sid, state)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, cases)
}

func (h *Handler) getCase(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	details, err := h.svc.GetCaseDetails(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "case not found")
		return
	}
	httpx.JSON(w, http.StatusOK, details)
}

func (h *Handler) saveApplicationData(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	var data domain.ApplicationData
	if !decode(w, r, &data) {
		return
	}
	data.CaseID = caseID
	saved, err := h.svc.SaveApplicationData(r.Context(), caseID, data)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "save_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, saved)
}

func (h *Handler) listRequirements(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	reqs, err := h.svc.EvaluateRequirements(r.Context(), caseID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, reqs)
}

// uploadDocument uploads a file and attaches it to the named requirement slot.
func (h *Handler) uploadDocument(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())

	if err := r.ParseMultipartForm(maxDocUpload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "could not parse multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing file field")
		return
	}
	defer file.Close()

	requirementKey := r.FormValue("requirement_key")
	if requirementKey == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "requirement_key is required")
		return
	}

	// Store the file in the documents module.
	doc, err := h.docSvc.Upload(r.Context(), documents.UploadInput{
		UploaderID:  user.ID,
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Size:        header.Size,
		Body:        file,
		Context: map[string]any{
			"case_id":         caseID.String(),
			"requirement_key": requirementKey,
		},
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "upload_failed", err.Error())
		return
	}

	// Attach the document to the requirement slot.
	req, err := h.svc.AttachDocument(r.Context(), caseID, requirementKey, doc.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "attach_failed", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"document":    doc,
		"requirement": req,
	})
}

func (h *Handler) submitCase(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.SubmitCase(r.Context(), caseID, user.ID)
	if err != nil {
		code := http.StatusBadRequest
		errCode := "submit_failed"
		if err == onboarding.ErrRequirementsUnmet {
			errCode = "requirements_unmet"
		}
		httpx.Error(w, code, errCode, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}

func (h *Handler) recordComplianceCheck(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	var in struct {
		CheckType string              `json:"check_type"`
		Outcome   domain.CheckOutcome `json:"outcome"`
		Notes     string              `json:"notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	chk, err := h.svc.RecordComplianceCheck(r.Context(), caseID, in.CheckType, in.Outcome, in.Notes, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "record_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, chk)
}

func (h *Handler) listComplianceChecks(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	checks, err := h.svc.ListComplianceChecks(r.Context(), caseID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, checks)
}

func (h *Handler) approveCase(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.ApproveCase(r.Context(), caseID, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "approve_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) rejectCase(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.RejectCase(r.Context(), caseID, user.ID, in.Reason)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "reject_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) returnCase(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	var in struct {
		Notes string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.ReturnCaseToWM(r.Context(), caseID, user.ID, in.Notes)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "return_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) reopenCase(w http.ResponseWriter, r *http.Request) {
	caseID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid case id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	c, err := h.svc.ReopenCase(r.Context(), caseID, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "reopen_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}
