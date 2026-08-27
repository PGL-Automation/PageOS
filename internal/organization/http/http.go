// Package orghttp exposes the organization capabilities over HTTP. Routes are
// protected by an auth middleware injected at wiring time.
package orghttp

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/organization"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const dateLayout = "2006-01-02"

type Handler struct {
	svc *organization.Service
}

func New(svc *organization.Service) *Handler {
	return &Handler{svc: svc}
}

// Routes returns the organization router. authMW guards every endpoint.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Post("/subsidiaries", h.createSubsidiary)
	r.Get("/subsidiaries", h.listSubsidiaries)
	r.Post("/departments", h.createDepartment)
	r.Get("/departments", h.listDepartments)
	r.Post("/positions", h.createPosition)
	r.Patch("/positions/{id}", h.updatePosition)
	r.Post("/persons", h.createPerson)
	r.Post("/assignments", h.createAssignment)
	r.Get("/positions/{id}/holders", h.resolveHolders)
	// Returns the caller's active positions in a given subsidiary.
	// Used by the frontend for role-based navigation.
	r.Get("/me/positions", h.myPositions)
	// Returns positions for a subsidiary + group-level positions.
	// Used by the HR create-user form to populate the position dropdown.
	r.Get("/positions", h.listPositions)
	// Org chart: positions + holders + reporting lines for a given subsidiary.
	r.Get("/org-chart", h.getOrgChart)
	// Returns only the subsidiaries this caller has active assignments in.
	// Group-wide users receive all subsidiaries.
	r.Get("/me/subsidiaries", h.mySubsidiaries)
	// HR user-management: list all users with their current org assignments.
	r.Get("/users", h.listUsers)
	// Staff directory: lightweight person list accessible to all authenticated users.
	// Used by reliever/assignee search throughout the app.
	r.Get("/staff", h.listStaff)
	// Gender update — HR / admin only.
	r.Patch("/persons/{personId}/gender", h.setPersonGender)
	return r
}

func (h *Handler) createSubsidiary(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	if !decode(w, r, &in) {
		return
	}
	sub, err := h.svc.CreateSubsidiary(r.Context(), in.Code, in.Name)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, sub)
}

func (h *Handler) listSubsidiaries(w http.ResponseWriter, r *http.Request) {
	subs, err := h.svc.ListSubsidiaries(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, subs)
}

func (h *Handler) listDepartments(w http.ResponseWriter, r *http.Request) {
	var sid *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		sid = &id
	}
	deps, err := h.svc.ListDepartments(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if deps == nil {
		deps = []organization.Department{}
	}
	httpx.JSON(w, http.StatusOK, deps)
}

func (h *Handler) createDepartment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID uuid.UUID `json:"subsidiary_id"`
		Code         string    `json:"code"`
		Name         string    `json:"name"`
	}
	if !decode(w, r, &in) {
		return
	}
	dep, err := h.svc.CreateDepartment(r.Context(), in.SubsidiaryID, in.Code, in.Name)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, dep)
}

func (h *Handler) createPosition(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID *uuid.UUID `json:"subsidiary_id"`
		DepartmentID *uuid.UUID `json:"department_id"`
		Code         string     `json:"code"`
		Title        string     `json:"title"`
		ReportsToID  *uuid.UUID `json:"reports_to_position_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Code == "" || in.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "code and title are required")
		return
	}
	pos, err := h.svc.CreatePosition(r.Context(), in.SubsidiaryID, in.DepartmentID, in.Code, in.Title, in.ReportsToID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, pos)
}

func (h *Handler) updatePosition(w http.ResponseWriter, r *http.Request) {
	posID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid position id")
		return
	}
	var in struct {
		Title       string     `json:"title"`
		ReportsToID *uuid.UUID `json:"reports_to_position_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.UpdatePosition(r.Context(), posID, in.Title, in.ReportsToID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) createPerson(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID    *uuid.UUID `json:"user_id"`
		FirstName string     `json:"first_name"`
		LastName  string     `json:"last_name"`
		Email     string     `json:"email"`
	}
	if !decode(w, r, &in) {
		return
	}
	p, err := h.svc.CreatePerson(r.Context(), in.UserID, in.FirstName, in.LastName, in.Email)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *Handler) createAssignment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PersonID               uuid.UUID  `json:"person_id"`
		PositionID             uuid.UUID  `json:"position_id"`
		SubsidiaryID           uuid.UUID  `json:"subsidiary_id"`
		DepartmentID           *uuid.UUID `json:"department_id"`
		EffectiveFrom          string     `json:"effective_from"` // YYYY-MM-DD
		IsPrimary              bool       `json:"is_primary"`
		ManagerOverridePersonID *uuid.UUID `json:"manager_override_person_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	from, err := time.Parse(dateLayout, in.EffectiveFrom)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "effective_from must be YYYY-MM-DD")
		return
	}
	a, err := h.svc.AssignPosition(r.Context(), in.PersonID, in.PositionID, in.SubsidiaryID, in.DepartmentID, from, in.IsPrimary, in.ManagerOverridePersonID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, a)
}

func (h *Handler) resolveHolders(w http.ResponseWriter, r *http.Request) {
	posID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid position id")
		return
	}
	on := time.Now()
	if q := r.URL.Query().Get("on"); q != "" {
		on, err = time.Parse(dateLayout, q)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "on must be YYYY-MM-DD")
			return
		}
	}
	holders, err := h.svc.ResolveHolders(r.Context(), posID, on)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, holders)
}

// myPositions returns the active positions of the authenticated user in the
// specified subsidiary. The frontend uses this to render role-appropriate navigation.
func (h *Handler) myPositions(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	sidStr := r.URL.Query().Get("subsidiary_id")
	if sidStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	sid, err := uuid.Parse(sidStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
		return
	}
	positions, err := h.svc.GetUserPositionsInSubsidiary(r.Context(), user.ID, sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if positions == nil {
		positions = []organization.UserPosition{}
	}
	httpx.JSON(w, http.StatusOK, positions)
}

// getOrgChart returns the org chart for a subsidiary (or group-level positions
// when no subsidiary_id is provided). The frontend uses this to render the
// reporting-line tree for each subsidiary's People & Org section.
func (h *Handler) getOrgChart(w http.ResponseWriter, r *http.Request) {
	sidStr := r.URL.Query().Get("subsidiary_id")
	var sid *uuid.UUID
	if sidStr != "" {
		id, err := uuid.Parse(sidStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		sid = &id
	}
	nodes, err := h.svc.GetOrgChart(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if nodes == nil {
		nodes = []organization.OrgChartNode{}
	}
	httpx.JSON(w, http.StatusOK, nodes)
}

// listPositions returns all positions for a given subsidiary plus all group-level
// positions. If no subsidiary_id query param is given, all positions are returned.
func (h *Handler) listPositions(w http.ResponseWriter, r *http.Request) {
	sidStr := r.URL.Query().Get("subsidiary_id")
	var sid *uuid.UUID
	if sidStr != "" {
		id, err := uuid.Parse(sidStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		sid = &id
	}
	positions, err := h.svc.GetPositionsBySubsidiary(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if positions == nil {
		positions = []organization.PositionWithMeta{}
	}
	httpx.JSON(w, http.StatusOK, positions)
}

// mySubsidiaries returns only the subsidiaries the authenticated caller belongs to.
// Group-wide users (holding a group-level position) receive every subsidiary.
func (h *Handler) mySubsidiaries(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	subs, err := h.svc.GetUserSubsidiaries(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if subs == nil {
		subs = []organization.Subsidiary{}
	}
	httpx.JSON(w, http.StatusOK, subs)
}

// listUsers returns all identity users with their current org assignments.
// Restricted to HR managers, HR officers, and group admins.
func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	hasAccess, err := h.svc.HasRole(r.Context(), caller.ID, "HR_MANAGER", "HR_OFFICER", "GROUP_ADMIN")
	if err != nil || !hasAccess {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
		return
	}
	users, err := h.svc.ListUsersWithAssignments(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, users)
}

// listStaff returns a lightweight list of all persons.
// Accessible to every authenticated user — used for reliever/assignee lookups.
// Supports ?search=name to filter server-side.
func (h *Handler) listStaff(w http.ResponseWriter, r *http.Request) {
	if _, ok := identityhttp.UserFrom(r.Context()); !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	search := r.URL.Query().Get("search")
	staff, err := h.svc.ListStaff(r.Context(), search)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, staff)
}

// setPersonGender lets HR update a person's gender — required for Maternity /
// Paternity leave eligibility filtering.
func (h *Handler) setPersonGender(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	hasAccess, err := h.svc.HasRole(r.Context(), caller.ID, "HR_MANAGER", "HR_OFFICER", "GROUP_ADMIN")
	if err != nil || !hasAccess {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
		return
	}
	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid personId")
		return
	}
	var in struct {
		Gender string `json:"gender"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Gender != "M" && in.Gender != "F" && in.Gender != "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", `gender must be "M", "F", or ""`)
		return
	}
	gender := in.Gender
	if gender == "" {
		// empty string clears the field
		if err := h.svc.SetPersonGender(r.Context(), personID, ""); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	} else {
		if err := h.svc.SetPersonGender(r.Context(), personID, gender); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// decode reads a JSON body into v, writing a 400 and returning false on error.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}
