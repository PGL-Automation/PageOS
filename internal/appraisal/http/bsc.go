package appraisalhttp

// BSC HTTP handlers — KPI management, individual scorecards, phase control,
// BSC workflow actions, and CSV export.

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/appraisal"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// RegisterBSCRoutes adds BSC-specific routes to an existing router.
// Call this from the main Routes() method.
func (h *Handler) RegisterBSCRoutes(r chi.Router) {
	// KPI management (dept heads only)
	r.Get("/cycles/{id}/kpis", h.listKPIs)
	r.Post("/cycles/{id}/kpis", h.saveKPIs)
	r.Get("/cycles/{id}/kpi-departments", h.listKPIDepartments)
	r.Get("/cycles/{id}/kpi-targets", h.getKPITargets)
	r.Post("/cycles/{id}/kpi-targets", h.saveKPITargets)

	// Target accept / reject (employee self-action)
	r.Post("/submissions/{id}/accept-targets", h.acceptTargets)
	r.Post("/submissions/{id}/reject-targets", h.rejectTargets)

	// Individual scorecard (manager + HC)
	r.Get("/cycles/{id}/individual-scorecard/{empId}", h.getIndividualScorecard)
	r.Post("/cycles/{id}/individual-scorecard/{empId}", h.saveIndividualScorecard)

	// Phase management (HC)
	r.Post("/cycles/{id}/phase", h.setCyclePhase)
	r.Get("/cycles/{id}/targets-progress", h.targetsProgress)

	// BSC workflow actions
	r.Post("/submissions/{id}/bsc-action", h.bscAction)

	// Generate submissions from org
	r.Post("/cycles/{id}/generate-submissions", h.generateSubmissions)

	// BSC-enriched views
	r.Get("/cycles/{id}/bsc-submissions", h.listBSCSubmissions)
	r.Get("/submissions/{id}/bsc", h.getBSCSubmission)

	// CSV export
	r.Get("/cycles/{id}/export.csv", h.exportCSV)
}

// ── KPI management ─────────────────────────────────────────────────────────────

func (h *Handler) listKPIs(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	dept := r.URL.Query().Get("dept")
	if dept == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "dept query param required")
		return
	}

	// Department heads may only view KPIs for their own department.
	// HR/admin callers may query any department.
	isHR := h.svc.IsHR(r.Context(), user.ID)
	if !isHR && h.svc.IsDeptHead(r.Context(), user.ID) {
		callerDept := h.svc.CallerDepartment(r.Context(), user.ID)
		if callerDept != dept {
			httpx.Error(w, http.StatusForbidden, "forbidden", "you can only view KPIs for your own department")
			return
		}
	}

	kpis, err := h.svc.ListKPIs(r.Context(), cycleID, dept)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if kpis == nil {
		kpis = []appraisal.KPI{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"department":   dept,
		"perspectives": appraisal.BSCPerspectives,
		"kpis":         kpis,
	})
}

func (h *Handler) listKPIDepartments(w http.ResponseWriter, r *http.Request) {
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	depts, err := h.svc.ListKPIDepartments(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if depts == nil {
		depts = []string{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"departments": depts, "perspectives": appraisal.BSCPerspectives})
}

func (h *Handler) saveKPIs(w http.ResponseWriter, r *http.Request) {
	// Only department heads can configure KPIs — NOT HR acting on their behalf.
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	isHR := h.svc.IsHR(r.Context(), user.ID)
	if !isHR && !h.svc.IsDeptHead(r.Context(), user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only department heads can configure KPIs")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}

	var body struct {
		Department string `json:"department"`
		KPIs       []struct {
			Perspective string  `json:"perspective"`
			Seq         int     `json:"seq"`
			Objective   string  `json:"objective"`
			Measure     string  `json:"measure"`
			Weight      float64 `json:"weight"`
		} `json:"kpis"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Department == "" || len(body.KPIs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "department and kpis required")
		return
	}

	// Dept heads may only configure KPIs for their own department.
	if !isHR {
		callerDept := h.svc.CallerDepartment(r.Context(), user.ID)
		if callerDept == "" || callerDept != body.Department {
			httpx.Error(w, http.StatusForbidden, "forbidden", "you can only configure KPIs for your own department")
			return
		}
	}

	// Validate weights total 100
	var total float64
	for _, k := range body.KPIs {
		total += k.Weight
	}
	if total < 99 || total > 101 {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "KPI weights must total 100%")
		return
	}

	items := make([]appraisal.KPIInput, len(body.KPIs))
	for i, k := range body.KPIs {
		items[i] = appraisal.KPIInput{
			Perspective: k.Perspective, Seq: k.Seq,
			Objective: k.Objective, Measure: k.Measure, Weight: k.Weight,
		}
	}

	kpis, err := h.svc.SaveKPIs(r.Context(), cycleID, body.Department, items, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"kpis": kpis})
}

func (h *Handler) getKPITargets(w http.ResponseWriter, r *http.Request) {
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	dept, role, grade := q.Get("dept"), q.Get("role"), q.Get("grade")
	if dept == "" || role == "" || grade == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "dept, role, grade required")
		return
	}
	targets, err := h.svc.GetKPITargets(r.Context(), cycleID, dept, role, grade)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"targets": targets})
}

func (h *Handler) saveKPITargets(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if !h.svc.IsDeptHead(r.Context(), user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only department heads can configure KPI targets")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	var body struct {
		Department string            `json:"department"`
		Role       string            `json:"role"`
		Grade      string            `json:"grade"`
		Targets    map[string]string `json:"targets"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := h.svc.SaveKPITargets(r.Context(), cycleID, body.Department, body.Role, body.Grade, body.Targets); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Individual scorecard ───────────────────────────────────────────────────────

func (h *Handler) getIndividualScorecard(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	empIDStr := chi.URLParam(r, "empId")
	empID, err := uuid.Parse(empIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid employee id")
		return
	}

	// Authorization: the employee themselves, HR, or their manager
	isHR := h.svc.IsHR(r.Context(), user.ID)
	if !isHR && user.ID != empID {
		// check if manager
		isMgr := h.svc.IsManagerOf(r.Context(), user.ID, empID)
		if !isMgr {
			httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
			return
		}
	}

	// Seed from dept if not set yet
	dept := r.URL.Query().Get("dept")
	role := r.URL.Query().Get("role")
	grade := r.URL.Query().Get("grade")
	if dept != "" && role != "" && grade != "" {
		_ = h.svc.SeedIndividualFromDept(r.Context(), cycleID, empID, dept, role, grade, user.ID)
	}

	scorecard, err := h.svc.GetIndividualScorecard(r.Context(), cycleID, empID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if scorecard == nil {
		scorecard = []appraisal.IndividualKPI{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"scorecard":    scorecard,
		"perspectives": appraisal.BSCPerspectives,
	})
}

func (h *Handler) saveIndividualScorecard(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	empIDStr := chi.URLParam(r, "empId")
	empID, err := uuid.Parse(empIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid employee id")
		return
	}

	isHR     := h.svc.IsHR(r.Context(), user.ID)
	isHead   := h.svc.IsDeptHead(r.Context(), user.ID)
	isMgr    := h.svc.IsManagerOf(r.Context(), user.ID, empID)
	if !isHR && !isHead && !isMgr {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only line managers, department heads or HR can set targets")
		return
	}
	// HR cannot set their own scorecard — a different reviewer must be assigned.
	if isHR && user.ID == empID {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR cannot set their own scorecard — assign a different reviewer")
		return
	}

	var body struct {
		KPIs []appraisal.IndividualKPI `json:"kpis"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := h.svc.SaveIndividualScorecard(r.Context(), cycleID, empID, user.ID, body.KPIs); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}

	// Mark target_status as 'set' so employee knows to review
	_ = h.svc.SetTargetStatus(r.Context(), cycleID, empID, "set")

	// Notify the employee — fire-and-forget
	go h.svc.NotifyTargetsSet(context.Background(), cycleID, empID, user.ID)

	scorecard, _ := h.svc.GetIndividualScorecard(r.Context(), cycleID, empID)
	httpx.JSON(w, http.StatusOK, map[string]any{"scorecard": scorecard})
}

// ── Phase management ───────────────────────────────────────────────────────────

func (h *Handler) setCyclePhase(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	var body struct {
		Phase string `json:"phase"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := h.svc.SetCyclePhase(r.Context(), cycleID, body.Phase); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// When switching to appraisal phase, notify all employees that they can now submit
	if body.Phase == "appraisal" {
		go h.svc.NotifyEmployeesOnAppraisalPhase(context.Background(), cycleID)
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"phase": body.Phase})
}

func (h *Handler) targetsProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if !h.svc.IsHR(r.Context(), user.ID) && !h.svc.IsDeptHead(r.Context(), user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or department head role required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	rows, err := h.svc.TargetsProgress(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []appraisal.TargetProgress{}
	}
	set := 0
	for _, r := range rows {
		if r.TargetsSet {
			set++
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rows": rows, "set": set, "total": len(rows)})
}

// ── BSC workflow ───────────────────────────────────────────────────────────────

func (h *Handler) bscAction(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	subIDStr := chi.URLParam(r, "id")
	subID, err := uuid.Parse(subIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid submission id")
		return
	}

	var body struct {
		Action           string             `json:"action"`
		SelfJSON         map[string]float64 `json:"self_json"`
		AgreedJSON       map[string]float64 `json:"agreed_json"`
		EmployeeComments string             `json:"employee_comments"`
		ManagerComments  string             `json:"manager_comments"`
		DevelopmentPlan  string             `json:"development_plan"`
		HCComments       string             `json:"hc_comments"`
	}
	if !decode(w, r, &body) {
		return
	}

	isHR := h.svc.IsHR(r.Context(), user.ID)

	// For employee self-assessment actions, enforce the cycle is in "appraisal" phase.
	if body.Action == "save-self" || body.Action == "submit-self" {
		// Resolve cycle_id from the submission.
		sub, err := h.svc.GetBSCSubmission(r.Context(), subID)
		if err != nil {
			httpx.Error(w, http.StatusNotFound, "not_found", "submission not found")
			return
		}
		phase, err := h.svc.GetCyclePhase(r.Context(), sub.CycleID)
		if err == nil && phase != "appraisal" && phase != "" {
			httpx.Error(w, http.StatusBadRequest, "wrong_phase", "self-assessment is only available during the appraisal phase")
			return
		}
	}

	result, err := h.svc.ApplyBSCAction(r.Context(), subID, user.ID, isHR, appraisal.BSCAction{
		Action:           body.Action,
		SelfJSON:         body.SelfJSON,
		AgreedJSON:       body.AgreedJSON,
		EmployeeComments: body.EmployeeComments,
		ManagerComments:  body.ManagerComments,
		DevelopmentPlan:  body.DevelopmentPlan,
		HCComments:       body.HCComments,
	})
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "action_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// ── Generate submissions ───────────────────────────────────────────────────────

func (h *Handler) generateSubmissions(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if !h.svc.IsHR(r.Context(), user.ID) && !h.svc.IsDeptHead(r.Context(), user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or department head role required")
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	created, existing, err := h.svc.GenerateBSCSubmissions(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"created": created, "existing": existing, "total": created + existing})
}

// ── BSC views ──────────────────────────────────────────────────────────────────

func (h *Handler) listBSCSubmissions(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	subs, err := h.svc.ListBSCSubmissions(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if subs == nil {
		subs = []appraisal.BSCSubmission{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"submissions": subs})
}

func (h *Handler) getBSCSubmission(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	subIDStr := chi.URLParam(r, "id")
	subID, err := uuid.Parse(subIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid submission id")
		return
	}
	sub, err := h.svc.GetBSCSubmission(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "submission not found")
		return
	}
	isHR := h.svc.IsHR(r.Context(), user.ID)
	isOwn := user.ID == sub.AppraiseeID
	isMgr := sub.ManagerID != nil && user.ID == *sub.ManagerID
	if !isHR && !isOwn && !isMgr {
		httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
		return
	}
	httpx.JSON(w, http.StatusOK, sub)
}

// ── Target accept / reject ─────────────────────────────────────────────────────

func (h *Handler) acceptTargets(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	subIDStr := chi.URLParam(r, "id")
	subID, err := uuid.Parse(subIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid submission id")
		return
	}

	// Only the appraisee can accept their own targets
	sub, err := h.svc.GetBSCSubmission(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "submission not found")
		return
	}
	if user.ID != sub.AppraiseeID {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only the appraisee can accept targets")
		return
	}

	if err := h.svc.SetTargetStatus(r.Context(), sub.CycleID, sub.AppraiseeID, "accepted"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"target_status": "accepted"})
}

func (h *Handler) rejectTargets(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	subIDStr := chi.URLParam(r, "id")
	subID, err := uuid.Parse(subIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid submission id")
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	sub, err := h.svc.GetBSCSubmission(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "submission not found")
		return
	}
	if user.ID != sub.AppraiseeID {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only the appraisee can reject targets")
		return
	}

	if err := h.svc.SetTargetStatus(r.Context(), sub.CycleID, sub.AppraiseeID, "rejected"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	// Notify manager
	go h.svc.NotifyManagerOnTargetRejection(r.Context(), sub.CycleID, sub.AppraiseeID, body.Reason)

	httpx.JSON(w, http.StatusOK, map[string]string{"target_status": "rejected"})
}

// ── CSV export ─────────────────────────────────────────────────────────────────

func (h *Handler) exportCSV(w http.ResponseWriter, r *http.Request) {
	if !h.requireHR(w, r) {
		return
	}
	cycleID, ok := parseCycleID(w, r)
	if !ok {
		return
	}
	rows, err := h.svc.ExportCSVRows(r.Context(), cycleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	var buf bytes.Buffer
	cw := csv.NewWriter(&buf)
	_ = cw.WriteAll(rows)
	cw.Flush()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="appraisals.csv"`)
	w.Write(buf.Bytes()) //nolint:errcheck
}
