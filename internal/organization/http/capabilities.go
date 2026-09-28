package orghttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/organization"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// listCapabilities handles GET /capabilities?domain=<optional>
// Any authenticated user may call this.
func (h *Handler) listCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := identityhttp.UserFrom(r.Context()); !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	domain := r.URL.Query().Get("domain")
	caps, err := h.capSvc.ListCapabilities(r.Context(), domain)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if caps == nil {
		caps = []organization.Capability{}
	}
	httpx.JSON(w, http.StatusOK, caps)
}

// getMyCapabilities handles GET /capabilities/me
// Returns all resolved capabilities for the authenticated caller.
func (h *Handler) getMyCapabilities(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	caps, err := h.capSvc.GetMyCapabilities(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if caps == nil {
		caps = []organization.ResolvedCapability{}
	}
	httpx.JSON(w, http.StatusOK, caps)
}

// getPersonCapabilities handles GET /capabilities/person/{personId}
// The caller must CanManageDomain for at least one domain; results are filtered
// to only the domains the caller manages.
func (h *Handler) getPersonCapabilities(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	callerDomains, err := h.capSvc.GetAllDomainsUserCanManage(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if len(callerDomains) == 0 {
		httpx.Error(w, http.StatusForbidden, "forbidden", "you do not manage any capability domains")
		return
	}

	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid personId")
		return
	}

	all, err := h.capSvc.GetPersonCapabilities(r.Context(), personID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	// Filter to only capabilities in domains the caller manages.
	managedSet := make(map[string]struct{}, len(callerDomains))
	for _, d := range callerDomains {
		managedSet[d] = struct{}{}
	}

	filtered := make([]organization.ResolvedCapability, 0, len(all))
	for _, c := range all {
		if _, ok := managedSet[c.Domain]; ok {
			filtered = append(filtered, c)
		}
	}
	httpx.JSON(w, http.StatusOK, filtered)
}

// grantCapability handles POST /capabilities/person/{personId}/grant
// Body: { "capability_code": string }
// Caller must CanManageDomain for the capability's domain.
func (h *Handler) grantCapability(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid personId")
		return
	}

	var in struct {
		CapabilityCode string `json:"capability_code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.CapabilityCode == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "capability_code is required")
		return
	}

	if ok, err := h.callerCanManageCapability(r, caller.ID, in.CapabilityCode); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	} else if !ok {
		httpx.Error(w, http.StatusForbidden, "forbidden", "you do not manage the domain for this capability")
		return
	}

	callerPersonID, err := h.capSvc.GetPersonID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	if err := h.capSvc.GrantCapability(r.Context(), personID, in.CapabilityCode, callerPersonID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// revokeCapability handles POST /capabilities/person/{personId}/revoke
// Body: { "capability_code": string }
// Caller must CanManageDomain for the capability's domain.
func (h *Handler) revokeCapability(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid personId")
		return
	}

	var in struct {
		CapabilityCode string `json:"capability_code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.CapabilityCode == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "capability_code is required")
		return
	}

	if ok, err := h.callerCanManageCapability(r, caller.ID, in.CapabilityCode); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	} else if !ok {
		httpx.Error(w, http.StatusForbidden, "forbidden", "you do not manage the domain for this capability")
		return
	}

	callerPersonID, err := h.capSvc.GetPersonID(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	if err := h.capSvc.RevokeCapability(r.Context(), personID, in.CapabilityCode, callerPersonID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// resetToRoleDefault handles POST /capabilities/person/{personId}/reset
// Body: { "capability_code": string }
// Caller must CanManageDomain for the capability's domain.
func (h *Handler) resetToRoleDefault(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	personID, err := uuid.Parse(chi.URLParam(r, "personId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid personId")
		return
	}

	var in struct {
		CapabilityCode string `json:"capability_code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.CapabilityCode == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "capability_code is required")
		return
	}

	if ok, err := h.callerCanManageCapability(r, caller.ID, in.CapabilityCode); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	} else if !ok {
		httpx.Error(w, http.StatusForbidden, "forbidden", "you do not manage the domain for this capability")
		return
	}

	if err := h.capSvc.ResetToRoleDefault(r.Context(), personID, in.CapabilityCode); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// getMyDomains handles GET /capabilities/domains
// Returns the list of domains the caller can manage.
func (h *Handler) getMyDomains(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	domains, err := h.capSvc.GetAllDomainsUserCanManage(r.Context(), caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if domains == nil {
		domains = []string{}
	}
	httpx.JSON(w, http.StatusOK, domains)
}

// callerCanManageCapability looks up the domain of the given capability code and
// checks whether the caller holds a domain-manager position for that domain.
// Returns (false, nil) when the capability code is not found.
func (h *Handler) callerCanManageCapability(r *http.Request, callerUserID uuid.UUID, capCode string) (bool, error) {
	// Resolve the capability's domain from the full capability list.
	all, err := h.capSvc.ListCapabilities(r.Context(), "")
	if err != nil {
		return false, err
	}
	var domain string
	for _, c := range all {
		if c.Code == capCode {
			domain = c.Domain
			break
		}
	}
	if domain == "" {
		// Unknown capability code — deny without error.
		return false, nil
	}
	return h.capSvc.CanManageDomain(r.Context(), callerUserID, domain)
}
