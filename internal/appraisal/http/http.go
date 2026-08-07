// Package appraisalhttp exposes appraisal cycle management over HTTP.
package appraisalhttp

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/appraisal"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// Handler wires HTTP to the appraisal service.
type Handler struct {
	svc *appraisal.Service
}

// New constructs a Handler.
func New(svc *appraisal.Service) *Handler {
	return &Handler{svc: svc}
}

// Routes returns the appraisal router with the supplied auth middleware applied.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Cycles
	r.Post("/cycles", h.createCycle)
	r.Get("/cycles", h.listCycles)
	r.Get("/cycles/{id}", h.getCycle)
	r.Patch("/cycles/{id}", h.updateCycle)
	r.Post("/cycles/{id}/open", h.openCycle)
	r.Post("/cycles/{id}/close", h.closeCycle)
	r.Post("/cycles/{id}/archive", h.archiveCycle)

	// Questions
	r.Post("/cycles/{id}/questions", h.addQuestion)
	r.Get("/cycles/{id}/questions", h.listQuestions)
	r.Put("/cycles/{id}/questions/{qid}", h.updateQuestion)
	r.Delete("/cycles/{id}/questions/{qid}", h.deleteQuestion)

	// Reviewer assignments
	r.Post("/cycles/{id}/assignments", h.assignReviewer)
	r.Get("/cycles/{id}/assignments", h.listAssignments)
	r.Delete("/cycles/{id}/assignments/{aid}", h.removeAssignment)
	r.Post("/cycles/{id}/assignments/auto", h.autoAssign)

	// Self-assessment
	r.Get("/cycles/{id}/my-submission", h.getMySubmission)
	r.Post("/cycles/{id}/my-submission/responses", h.upsertSelfResponses)
	r.Post("/cycles/{id}/my-submission/submit", h.submitSelf)

	// Manager review
	r.Get("/reviews/pending", h.getPendingReviews)
	r.Post("/submissions/{id}/manager-responses", h.upsertManagerResponses)
	r.Post("/submissions/{id}/manager-submit", h.submitManagerReview)

	// HR admin views
	r.Get("/cycles/{id}/submissions", h.listCycleSubmissions)
	r.Get("/submissions/{id}", h.getSubmissionDetail)

	// Employee: list all their own submissions across cycles
	r.Get("/my-submissions", h.listMySubmissions)

	return r
}

// -------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}

// parseOptionalDate accepts both YYYY-MM-DD (from HTML date inputs) and
// RFC 3339 strings, returning nil on empty/null input.
func parseOptionalDate(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339} {
		if t, err := time.Parse(layout, *s); err == nil {
			return &t
		}
	}
	return nil
}

func parseCycleID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid cycle id")
		return uuid.Nil, false
	}
	return id, true
}

func parseSubmissionID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid submission id")
		return uuid.Nil, false
	}
	return id, true
}

// requireHR checks that the caller has HR or admin role. It writes the error
// response itself and returns false when access is denied.
func (h *Handler) requireHR(w http.ResponseWriter, r *http.Request) bool {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return false
	}
	isHR, err := h.svc.HasHROrAdminRole(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return false
	}
	if !isHR {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin role required")
		return false
	}
	return true
}

// -------------------------------------------------------------------------
// Cycle handlers
// -------------------------------------------------------------------------

func (h *Handler) createCycle(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())

	var in struct {
		Title           string     `json:"title"`
		Description     string     `json:"description"`
		SubsidiaryID    *uuid.UUID `json:"subsidiary_id"`
		SelfDeadline    *string    `json:"self_deadline"`
		ManagerDeadline *string    `json:"manager_deadline"`
	}
	if !decode(w, r, &in) {
		return
	}
	selfDL, managerDL := parseOptionalDate(in.SelfDeadline), parseOptionalDate(in.ManagerDeadline)
	cycle, err := h.svc.CreateCycle(r.Context(), in.Title, in.Description, in.SubsidiaryID, selfDL, managerDL, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, cycle)
}

func (h *Handler) listCycles(w http.ResponseWriter, r *http.Request) {
	var subsidiaryID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subsidiaryID = &id
	}
	cycles, err := h.svc.ListCycles(r.Context(), subsidiaryID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, cycles)
}

func (h *Handler) getCycle(w http.ResponseWriter, r *http.Request) {
	id, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	cycle, err := h.svc.GetCycle(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "cycle not found")
		return
	}
	httpx.JSON(w, http.StatusOK, cycle)
}

func (h *Handler) updateCycle(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	id, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	var in struct {
		Title           string  `json:"title"`
		Description     string  `json:"description"`
		SelfDeadline    *string `json:"self_deadline"`
		ManagerDeadline *string `json:"manager_deadline"`
	}
	if !decode(w, r, &in) {
		return
	}
	selfDL, managerDL := parseOptionalDate(in.SelfDeadline), parseOptionalDate(in.ManagerDeadline)
	cycle, err := h.svc.UpdateCycle(r.Context(), id, in.Title, in.Description, selfDL, managerDL)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, cycle)
}

func (h *Handler) openCycle(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	id, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	cycle, err := h.svc.OpenCycle(r.Context(), id, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "open_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, cycle)
}

func (h *Handler) closeCycle(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	id, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	cycle, err := h.svc.CloseCycle(r.Context(), id, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "close_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, cycle)
}

func (h *Handler) archiveCycle(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	id, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	cycle, err := h.svc.ArchiveCycle(r.Context(), id, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "archive_failed", "Cycle must be closed before it can be archived")
		return
	}
	httpx.JSON(w, http.StatusOK, cycle)
}

// -------------------------------------------------------------------------
// Question handlers
// -------------------------------------------------------------------------

func (h *Handler) addQuestion(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	var in struct {
		Category    string  `json:"category"`
		Text        string  `json:"text"`
		Description string  `json:"description"`
		MaxScore    int     `json:"max_score"`
		Weight      float64 `json:"weight"`
		OrderIndex  int     `json:"order_index"`
	}
	if !decode(w, r, &in) {
		return
	}
	q, err := h.svc.AddQuestion(r.Context(), cycleID, appraisal.QuestionInput{
		Category:    in.Category,
		Text:        in.Text,
		Description: in.Description,
		MaxScore:    in.MaxScore,
		Weight:      in.Weight,
		OrderIndex:  in.OrderIndex,
	}, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, q)
}

func (h *Handler) listQuestions(w http.ResponseWriter, r *http.Request) {
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	questions, err := h.svc.ListQuestions(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, questions)
}

func (h *Handler) updateQuestion(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	qid, err := uuid.Parse(chi.URLParam(r, "qid"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid question id")
		return
	}

	var in struct {
		Category    string  `json:"category"`
		Text        string  `json:"text"`
		Description string  `json:"description"`
		MaxScore    int     `json:"max_score"`
		Weight      float64 `json:"weight"`
		OrderIndex  int     `json:"order_index"`
	}
	if !decode(w, r, &in) {
		return
	}
	q, err := h.svc.UpdateQuestion(r.Context(), qid, appraisal.QuestionInput{
		Category:    in.Category,
		Text:        in.Text,
		Description: in.Description,
		MaxScore:    in.MaxScore,
		Weight:      in.Weight,
		OrderIndex:  in.OrderIndex,
	})
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, q)
}

func (h *Handler) deleteQuestion(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	qid, err := uuid.Parse(chi.URLParam(r, "qid"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid question id")
		return
	}
	if err := h.svc.DeleteQuestion(r.Context(), qid); err != nil {
		httpx.Error(w, http.StatusBadRequest, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// -------------------------------------------------------------------------
// Reviewer assignment handlers
// -------------------------------------------------------------------------

func (h *Handler) assignReviewer(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	var in struct {
		AppraiseeID uuid.UUID `json:"appraisee_id"`
		ReviewerID  uuid.UUID `json:"reviewer_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	ra, err := h.svc.AssignReviewer(r.Context(), cycleID, in.AppraiseeID, in.ReviewerID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "assign_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, ra)
}

func (h *Handler) listAssignments(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	assignments, err := h.svc.ListAssignments(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, assignments)
}

func (h *Handler) removeAssignment(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	aid, err := uuid.Parse(chi.URLParam(r, "aid"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid assignment id")
		return
	}
	if err := h.svc.RemoveAssignment(r.Context(), aid); err != nil {
		httpx.Error(w, http.StatusBadRequest, "remove_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Handler) autoAssign(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	caller, _ := identityhttp.UserFrom(r.Context())
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	result, err := h.svc.AutoAssignFromOrgChart(r.Context(), cycleID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "auto_assign_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// -------------------------------------------------------------------------
// Self-assessment handlers
// -------------------------------------------------------------------------

func (h *Handler) getMySubmission(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	// Verify cycle is open before returning submission.
	cycle, err := h.svc.GetCycle(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "cycle not found")
		return
	}
	if cycle.Status != "open" {
		httpx.Error(w, http.StatusNotFound, "not_found", "no open cycle for caller")
		return
	}

	detail, err := h.svc.GetMySubmission(r.Context(), cycleID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, detail)
}

func (h *Handler) upsertSelfResponses(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	// Verify cycle is open.
	cycle, err := h.svc.GetCycle(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "cycle not found")
		return
	}
	if cycle.Status != "open" {
		httpx.Error(w, http.StatusBadRequest, "cycle_not_open", "cycle is not open")
		return
	}

	var body struct {
		Responses []struct {
			QuestionID uuid.UUID `json:"question_id"`
			Score      float64   `json:"score"`
			Comment    string    `json:"comment"`
		} `json:"responses"`
	}
	if !decode(w, r, &body) {
		return
	}

	// Ensure submission exists.
	sub, err := h.svc.GetOrCreateSubmission(r.Context(), cycleID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	inputs := make([]appraisal.ResponseInput, len(body.Responses))
	for i, resp := range body.Responses {
		inputs[i] = appraisal.ResponseInput{
			QuestionID: resp.QuestionID,
			Score:      resp.Score,
			Comment:    resp.Comment,
		}
	}
	if err := h.svc.UpsertSelfResponses(r.Context(), sub.ID, caller.ID, inputs); err != nil {
		httpx.Error(w, http.StatusBadRequest, "upsert_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

func (h *Handler) submitSelf(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	// Verify cycle is open.
	cycle, err := h.svc.GetCycle(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "cycle not found")
		return
	}
	if cycle.Status != "open" {
		httpx.Error(w, http.StatusBadRequest, "cycle_not_open", "cycle is not open")
		return
	}

	sub, err := h.svc.GetOrCreateSubmission(r.Context(), cycleID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	result, err := h.svc.SubmitSelf(r.Context(), sub.ID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "submit_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// -------------------------------------------------------------------------
// Manager review handlers
// -------------------------------------------------------------------------

func (h *Handler) getPendingReviews(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	submissions, err := h.svc.GetPendingReviews(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, submissions)
}

func (h *Handler) upsertManagerResponses(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	submissionID, ok := parseSubmissionID(w, r)
	if !ok {
		return
	}

	var body struct {
		Responses []struct {
			QuestionID uuid.UUID `json:"question_id"`
			Score      float64   `json:"score"`
			Comment    string    `json:"comment"`
		} `json:"responses"`
	}
	if !decode(w, r, &body) {
		return
	}

	inputs := make([]appraisal.ResponseInput, len(body.Responses))
	for i, resp := range body.Responses {
		inputs[i] = appraisal.ResponseInput{
			QuestionID: resp.QuestionID,
			Score:      resp.Score,
			Comment:    resp.Comment,
		}
	}
	if err := h.svc.UpsertManagerResponses(r.Context(), submissionID, caller.ID, inputs); err != nil {
		httpx.Error(w, http.StatusBadRequest, "upsert_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

func (h *Handler) submitManagerReview(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	submissionID, ok := parseSubmissionID(w, r)
	if !ok {
		return
	}
	result, err := h.svc.SubmitManagerReview(r.Context(), submissionID, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "submit_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// -------------------------------------------------------------------------
// HR admin view handlers
// -------------------------------------------------------------------------

func (h *Handler) listCycleSubmissions(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	submissions, err := h.svc.ListCycleSubmissions(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, submissions)
}

func (h *Handler) getSubmissionDetail(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	submissionID, ok := parseSubmissionID(w, r)
	if !ok {
		return
	}

	detail, err := h.svc.GetSubmissionDetail(r.Context(), submissionID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "submission not found")
		return
	}

	// Allow access if caller is HR/admin OR is the assigned reviewer.
	isHR, _ := h.svc.HasHROrAdminRole(r.Context(), caller.ID)
	isReviewer := detail.ReviewerID != nil && *detail.ReviewerID == caller.ID
	if !isHR && !isReviewer {
		httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// listMySubmissions returns all of the caller's own submissions across every cycle.
func (h *Handler) listMySubmissions(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	subs, err := h.svc.ListMySubmissions(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if subs == nil {
		subs = []appraisal.Submission{}
	}
	httpx.JSON(w, http.StatusOK, subs)
}
