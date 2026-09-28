package organization

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Capability represents a named permission unit.
type Capability struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Domain      string `json:"domain"`
	SortOrder   int    `json:"sort_order"`
}

// ResolvedCapability is a capability with its effective source for a person.
type ResolvedCapability struct {
	Capability
	Granted bool   `json:"granted"`
	Source  string `json:"source"` // "role_default", "individual_grant", "individual_revoke"
}

// CapabilityService is the single source of truth for all permission checks.
type CapabilityService struct {
	pool *pgxpool.Pool
}

// NewCapabilityService creates a CapabilityService backed by the given pool.
func NewCapabilityService(pool *pgxpool.Pool) *CapabilityService {
	return &CapabilityService{pool: pool}
}

// domainManagers maps each capability domain to the role codes whose holders
// are considered department heads for that domain.
var domainManagers = map[string][]string{
	"finance": {
		"HEAD_OF_OPERATIONS",
		"TREASURY_OPS_FINANCE_MGR",
		"FINOPS_MANAGER",
		"TL_FINANCIAL_REPORTING",
		"GROUP_ADMIN",
	},
	"reconciliation": {
		"HEAD_OF_OPERATIONS",
		"FINOPS_MANAGER",
		"GROUP_ADMIN",
	},
	"portfolio": {
		"HEAD_OF_INVESTMENT",
		"HEAD_INVESTMENT_MGMT",
		"GROUP_HEAD_WEALTH_MGMT",
		"GROUP_ADMIN",
	},
}

// CheckCapability is the hot path — called on every authenticated request.
// Returns true if the user (by user_id from identity.users) has the capability.
func (s *CapabilityService) CheckCapability(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	const q = `
SELECT COALESCE(
    -- Individual override: explicit grant or revoke
    (SELECT pc.granted
     FROM organization.person_capability pc
     JOIN organization.person per ON per.id = pc.person_id
     WHERE per.user_id = $1
       AND pc.capability_code = $2
       AND pc.is_active = true
     LIMIT 1),
    -- Role default: does their active position have this capability?
    (SELECT true
     FROM organization.role_capability rc
     JOIN organization.position pos ON pos.code = rc.role_code
     JOIN organization.assignment a ON a.position_id = pos.id
     JOIN organization.person per ON per.id = a.person_id
     WHERE per.user_id = $1
       AND rc.capability_code = $2
       AND a.effective_from <= CURRENT_DATE
       AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
     LIMIT 1),
    -- Default deny
    false
) AS has_capability`

	var has bool
	err := s.pool.QueryRow(ctx, q, userID, code).Scan(&has)
	if err != nil {
		return false, fmt.Errorf("capability.CheckCapability: %w", err)
	}
	return has, nil
}

// GetPersonID resolves a user_id to a person.id.
func (s *CapabilityService) GetPersonID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	const q = `SELECT id FROM organization.person WHERE user_id = $1 LIMIT 1`

	var personID uuid.UUID
	err := s.pool.QueryRow(ctx, q, userID).Scan(&personID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("capability.GetPersonID: no person found for user %s", userID)
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("capability.GetPersonID: %w", err)
	}
	return personID, nil
}

// ListCapabilities returns all capabilities, optionally filtered by domain.
// Pass an empty string to return all domains.
func (s *CapabilityService) ListCapabilities(ctx context.Context, domain string) ([]Capability, error) {
	var (
		rows pgx.Rows
		err  error
	)

	if domain != "" {
		const q = `
SELECT code, name, description, domain, sort_order
FROM organization.capability
WHERE domain = $1
ORDER BY domain, sort_order, code`
		rows, err = s.pool.Query(ctx, q, domain)
	} else {
		const q = `
SELECT code, name, description, domain, sort_order
FROM organization.capability
ORDER BY domain, sort_order, code`
		rows, err = s.pool.Query(ctx, q)
	}
	if err != nil {
		return nil, fmt.Errorf("capability.ListCapabilities: %w", err)
	}
	defer rows.Close()

	var caps []Capability
	for rows.Next() {
		var c Capability
		if err := rows.Scan(&c.Code, &c.Name, &c.Description, &c.Domain, &c.SortOrder); err != nil {
			return nil, fmt.Errorf("capability.ListCapabilities scan: %w", err)
		}
		caps = append(caps, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("capability.ListCapabilities rows: %w", err)
	}
	return caps, nil
}

// GetMyCapabilities returns all capabilities for the caller with resolution
// source info (role_default, individual_grant, individual_revoke).
func (s *CapabilityService) GetMyCapabilities(ctx context.Context, userID uuid.UUID) ([]ResolvedCapability, error) {
	personID, err := s.GetPersonID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.GetPersonCapabilities(ctx, personID)
}

// GetPersonCapabilities returns all capabilities for a specific person (by
// person_id) with resolution source info. Used by department heads to inspect
// another person's effective permissions.
func (s *CapabilityService) GetPersonCapabilities(ctx context.Context, personID uuid.UUID) ([]ResolvedCapability, error) {
	// Fetch all capabilities.
	const allCapsQ = `
SELECT code, name, description, domain, sort_order
FROM organization.capability
ORDER BY domain, sort_order, code`

	capRows, err := s.pool.Query(ctx, allCapsQ)
	if err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities list: %w", err)
	}
	defer capRows.Close()

	var allCaps []Capability
	for capRows.Next() {
		var c Capability
		if err := capRows.Scan(&c.Code, &c.Name, &c.Description, &c.Domain, &c.SortOrder); err != nil {
			return nil, fmt.Errorf("capability.GetPersonCapabilities scan caps: %w", err)
		}
		allCaps = append(allCaps, c)
	}
	if err := capRows.Err(); err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities caps rows: %w", err)
	}

	// Fetch individual overrides for this person.
	const indQ = `
SELECT capability_code, granted
FROM organization.person_capability
WHERE person_id = $1 AND is_active = true`

	indRows, err := s.pool.Query(ctx, indQ, personID)
	if err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities individual: %w", err)
	}
	defer indRows.Close()

	type indOverride struct{ granted bool }
	individual := make(map[string]indOverride)
	for indRows.Next() {
		var code string
		var granted bool
		if err := indRows.Scan(&code, &granted); err != nil {
			return nil, fmt.Errorf("capability.GetPersonCapabilities scan individual: %w", err)
		}
		individual[code] = indOverride{granted: granted}
	}
	if err := indRows.Err(); err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities individual rows: %w", err)
	}

	// Fetch role-based capabilities for this person's active assignments.
	const roleQ = `
SELECT DISTINCT rc.capability_code
FROM organization.role_capability rc
JOIN organization.position pos ON pos.code = rc.role_code
JOIN organization.assignment a ON a.position_id = pos.id
WHERE a.person_id = $1
  AND a.effective_from <= CURRENT_DATE
  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)`

	roleRows, err := s.pool.Query(ctx, roleQ, personID)
	if err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities role: %w", err)
	}
	defer roleRows.Close()

	roleSet := make(map[string]struct{})
	for roleRows.Next() {
		var code string
		if err := roleRows.Scan(&code); err != nil {
			return nil, fmt.Errorf("capability.GetPersonCapabilities scan role: %w", err)
		}
		roleSet[code] = struct{}{}
	}
	if err := roleRows.Err(); err != nil {
		return nil, fmt.Errorf("capability.GetPersonCapabilities role rows: %w", err)
	}

	// Assemble resolved capabilities.
	resolved := make([]ResolvedCapability, 0, len(allCaps))
	for _, cap := range allCaps {
		rc := ResolvedCapability{Capability: cap}

		if ov, ok := individual[cap.Code]; ok {
			// Individual override wins.
			rc.Granted = ov.granted
			if ov.granted {
				rc.Source = "individual_grant"
			} else {
				rc.Source = "individual_revoke"
			}
		} else if _, ok := roleSet[cap.Code]; ok {
			rc.Granted = true
			rc.Source = "role_default"
		} else {
			rc.Granted = false
			rc.Source = "role_default"
		}

		resolved = append(resolved, rc)
	}

	return resolved, nil
}

// GrantCapability grants a specific capability to a person (individual override).
// byPersonID is the person performing the grant (authorization enforced at the HTTP layer).
func (s *CapabilityService) GrantCapability(ctx context.Context, personID uuid.UUID, code string, byPersonID uuid.UUID) error {
	const q = `
INSERT INTO organization.person_capability (person_id, capability_code, granted, granted_by, granted_at, is_active)
VALUES ($1, $2, true, $3, now(), true)
ON CONFLICT (person_id, capability_code)
DO UPDATE SET granted = true, granted_by = $3, granted_at = now(), is_active = true`

	_, err := s.pool.Exec(ctx, q, personID, code, byPersonID)
	if err != nil {
		return fmt.Errorf("capability.GrantCapability: %w", err)
	}
	return nil
}

// RevokeCapability explicitly revokes a capability from a person.
// byPersonID is the person performing the revocation (authorization enforced at the HTTP layer).
func (s *CapabilityService) RevokeCapability(ctx context.Context, personID uuid.UUID, code string, byPersonID uuid.UUID) error {
	const q = `
INSERT INTO organization.person_capability (person_id, capability_code, granted, granted_by, granted_at, is_active)
VALUES ($1, $2, false, $3, now(), true)
ON CONFLICT (person_id, capability_code)
DO UPDATE SET granted = false, granted_by = $3, granted_at = now(), is_active = true`

	_, err := s.pool.Exec(ctx, q, personID, code, byPersonID)
	if err != nil {
		return fmt.Errorf("capability.RevokeCapability: %w", err)
	}
	return nil
}

// ResetToRoleDefault removes any individual override, restoring the role default.
func (s *CapabilityService) ResetToRoleDefault(ctx context.Context, personID uuid.UUID, code string) error {
	const q = `
UPDATE organization.person_capability
SET is_active = false
WHERE person_id = $1 AND capability_code = $2`

	_, err := s.pool.Exec(ctx, q, personID, code)
	if err != nil {
		return fmt.Errorf("capability.ResetToRoleDefault: %w", err)
	}
	return nil
}

// CanManageDomain returns true if the user holds an active position that is
// a recognized department head for the given domain.
func (s *CapabilityService) CanManageDomain(ctx context.Context, userID uuid.UUID, domain string) (bool, error) {
	managerRoles, ok := domainManagers[domain]
	if !ok {
		return false, fmt.Errorf("capability.CanManageDomain: unknown domain %q", domain)
	}

	// Build a parameterised ANY() check for the role codes.
	const q = `
SELECT EXISTS (
    SELECT 1
    FROM organization.position pos
    JOIN organization.assignment a ON a.position_id = pos.id
    JOIN organization.person per ON per.id = a.person_id
    WHERE per.user_id = $1
      AND pos.code = ANY($2::text[])
      AND a.effective_from <= CURRENT_DATE
      AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
)`

	var can bool
	err := s.pool.QueryRow(ctx, q, userID, managerRoles).Scan(&can)
	if err != nil {
		return false, fmt.Errorf("capability.CanManageDomain: %w", err)
	}
	return can, nil
}

// GetAllDomainsUserCanManage returns the list of domains this user is a head of.
func (s *CapabilityService) GetAllDomainsUserCanManage(ctx context.Context, userID uuid.UUID) ([]string, error) {
	// Fetch the set of role codes held by this user in active assignments.
	const q = `
SELECT DISTINCT pos.code
FROM organization.position pos
JOIN organization.assignment a ON a.position_id = pos.id
JOIN organization.person per ON per.id = a.person_id
WHERE per.user_id = $1
  AND a.effective_from <= CURRENT_DATE
  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)`

	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("capability.GetAllDomainsUserCanManage: %w", err)
	}
	defer rows.Close()

	held := make(map[string]struct{})
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, fmt.Errorf("capability.GetAllDomainsUserCanManage scan: %w", err)
		}
		held[code] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("capability.GetAllDomainsUserCanManage rows: %w", err)
	}

	var domains []string
	for domain, roles := range domainManagers {
		for _, role := range roles {
			if _, ok := held[role]; ok {
				domains = append(domains, domain)
				break
			}
		}
	}
	return domains, nil
}
