package financehttp

import (
	"encoding/json"
	"net/http"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/finance"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// adminRoles are the only roles that may update the permission configuration.
var adminRoles = map[string]bool{
	"HEAD_OF_OPERATIONS":       true,
	"FINOPS_MANAGER":           true,
	"TREASURY_OPS_FINANCE_MGR": true,
	"GROUP_ADMIN":              true,
}

// getMyPermissions returns the permission map for the authenticated caller's role.
// Accessible to any authenticated user — returns an empty map if the caller's
// role has no finance permissions rather than a 403. The permission table is the
// sole gate; a missing role here is not an error, just no access.
// GET /permissions/me
func (h *Handler) getMyPermissions(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	perms, err := h.svc.GetMyPermissions(r.Context(), caller.ID)
	if err != nil || perms == nil {
		perms = map[string]finance.RolePermission{}
	}
	httpx.JSON(w, http.StatusOK, perms)
}

// getAllPermissions returns the full permission matrix for all roles and modules.
// Accessible to any authenticated user so they can see the configuration.
// GET /permissions
func (h *Handler) getAllPermissions(w http.ResponseWriter, r *http.Request) {
	if _, ok := identityhttp.UserFrom(r.Context()); !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	matrix, err := h.svc.GetAllPermissions(r.Context())
	if err != nil || matrix == nil {
		matrix = finance.PermissionMatrix{}
	}
	httpx.JSON(w, http.StatusOK, matrix)
}

// updatePermission upserts a single role+module permission row.
// Restricted to senior admin roles — enforced via DB query, not an in-memory list.
// PUT /permissions
func (h *Handler) updatePermission(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

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
