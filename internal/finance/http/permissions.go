package financehttp

import (
	"encoding/json"
	"net/http"

	"github.com/pagegroup/pageos/internal/finance"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// adminRoles are the only roles that may update permission configuration.
var adminRoles = map[string]bool{
	"HEAD_OF_OPERATIONS":      true,
	"FINOPS_MANAGER":          true,
	"TREASURY_OPS_FINANCE_MGR": true,
	"GROUP_ADMIN":             true,
}

// getMyPermissions returns the permission map for the authenticated caller's role.
// GET /permissions/me
func (h *Handler) getMyPermissions(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requireFinanceStaff(w, r)
	if !ok {
		return
	}
	perms, err := h.svc.GetMyPermissions(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if perms == nil {
		perms = map[string]finance.RolePermission{}
	}
	httpx.JSON(w, http.StatusOK, perms)
}

// getAllPermissions returns the full permission matrix for all roles and modules.
// GET /permissions
func (h *Handler) getAllPermissions(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requireFinanceStaff(w, r)
	if !ok {
		return
	}
	_ = caller // authenticated; coarse access already checked via requireFinanceStaff
	matrix, err := h.svc.GetAllPermissions(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if matrix == nil {
		matrix = finance.PermissionMatrix{}
	}
	httpx.JSON(w, http.StatusOK, matrix)
}

// updatePermission upserts a single role+module permission row.
// Only senior roles (HEAD_OF_OPERATIONS, FINOPS_MANAGER, TREASURY_OPS_FINANCE_MGR, GROUP_ADMIN) may call this.
// PUT /permissions
func (h *Handler) updatePermission(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requireFinanceStaff(w, r)
	if !ok {
		return
	}

	// Resolve caller's role code to enforce admin-only gate.
	const roleQ = `
		SELECT pos.code
		FROM organization.assignment a
		JOIN organization.position pos ON pos.id = a.position_id
		JOIN organization.person   per ON per.id = a.person_id
		WHERE per.user_id = $1
		  AND pos.code = ANY($2::text[])
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		LIMIT 1
	`
	adminList := []string{"HEAD_OF_OPERATIONS", "FINOPS_MANAGER", "TREASURY_OPS_FINANCE_MGR", "GROUP_ADMIN"}
	var roleCode string
	if err := h.pool.QueryRow(r.Context(), roleQ, caller.ID, adminList).Scan(&roleCode); err != nil || !adminRoles[roleCode] {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only senior finance roles may update permissions")
		return
	}

	var in finance.UpdatePermissionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if in.RoleCode == "" || in.Module == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "role_code and module are required")
		return
	}

	rp, err := h.svc.UpdatePermission(r.Context(), in, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, rp)
}
