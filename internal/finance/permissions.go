package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type RolePermission struct {
	RoleCode   string     `json:"role_code"`
	Module     string     `json:"module"`
	CanView    bool       `json:"can_view"`
	CanCreate  bool       `json:"can_create"`
	CanApprove bool       `json:"can_approve"`
	CanExport  bool       `json:"can_export"`
	UpdatedBy  *uuid.UUID `json:"updated_by,omitempty"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type UpdatePermissionInput struct {
	RoleCode   string `json:"role_code"`
	Module     string `json:"module"`
	CanView    bool   `json:"can_view"`
	CanCreate  bool   `json:"can_create"`
	CanApprove bool   `json:"can_approve"`
	CanExport  bool   `json:"can_export"`
}

// PermissionMatrix is all permissions grouped by role_code.
type PermissionMatrix map[string]map[string]RolePermission // [role_code][module]

// ── Helpers ───────────────────────────────────────────────────────────────────

const roleCodeQuery = `
	SELECT pos.code
	FROM organization.assignment a
	JOIN organization.position pos ON pos.id = a.position_id
	JOIN organization.person per ON per.id = a.person_id
	WHERE per.user_id = $1
	  AND a.effective_from <= CURRENT_DATE
	  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
	ORDER BY a.effective_from DESC
	LIMIT 1
`

func scanRolePermission(row pgx.Row) (RolePermission, error) {
	var rp RolePermission
	err := row.Scan(
		&rp.RoleCode, &rp.Module,
		&rp.CanView, &rp.CanCreate, &rp.CanApprove, &rp.CanExport,
		&rp.UpdatedBy, &rp.UpdatedAt,
	)
	return rp, err
}

// ── Methods ───────────────────────────────────────────────────────────────────

// GetRoleCode returns the caller's active position code.
func (s *Service) GetRoleCode(ctx context.Context, userID uuid.UUID) (string, error) {
	var code string
	err := s.pool.QueryRow(ctx, roleCodeQuery, userID).Scan(&code)
	if err != nil {
		return "", fmt.Errorf("finance: get role code for user %s: %w", userID, err)
	}
	return code, nil
}

// CheckPermission returns true if the user's role has the given action on the
// module. action must be one of: "view", "create", "approve", "export".
// Returns false (not error) if no permission row exists — defaults to deny.
func (s *Service) CheckPermission(ctx context.Context, userID uuid.UUID, module, action string) (bool, error) {
	roleCode, err := s.GetRoleCode(ctx, userID)
	if err != nil {
		return false, err
	}

	const q = `
		SELECT role_code, module, can_view, can_create, can_approve, can_export, updated_by, updated_at
		FROM   finance.role_permission
		WHERE  role_code = $1 AND module = $2
	`
	rp, err := scanRolePermission(s.pool.QueryRow(ctx, q, roleCode, module))
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("finance: check permission: %w", err)
	}

	switch action {
	case "view":
		return rp.CanView, nil
	case "create":
		return rp.CanCreate, nil
	case "approve":
		return rp.CanApprove, nil
	case "export":
		return rp.CanExport, nil
	default:
		return false, fmt.Errorf("finance: unknown permission action %q", action)
	}
}

// GetMyPermissions returns all permission rows for the caller's role,
// keyed by module. Used by the frontend to know what to show/hide.
func (s *Service) GetMyPermissions(ctx context.Context, userID uuid.UUID) (map[string]RolePermission, error) {
	roleCode, err := s.GetRoleCode(ctx, userID)
	if err != nil {
		return nil, err
	}

	const q = `
		SELECT role_code, module, can_view, can_create, can_approve, can_export, updated_by, updated_at
		FROM   finance.role_permission
		WHERE  role_code = $1
		ORDER  BY module
	`
	rows, err := s.pool.Query(ctx, q, roleCode)
	if err != nil {
		return nil, fmt.Errorf("finance: get my permissions: %w", err)
	}
	defer rows.Close()

	out := make(map[string]RolePermission)
	for rows.Next() {
		var rp RolePermission
		if err := rows.Scan(
			&rp.RoleCode, &rp.Module,
			&rp.CanView, &rp.CanCreate, &rp.CanApprove, &rp.CanExport,
			&rp.UpdatedBy, &rp.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out[rp.Module] = rp
	}
	return out, rows.Err()
}

// GetAllPermissions returns the full permission matrix: every role x every module.
// Used by the admin permissions management UI.
func (s *Service) GetAllPermissions(ctx context.Context) (PermissionMatrix, error) {
	const q = `
		SELECT role_code, module, can_view, can_create, can_approve, can_export, updated_by, updated_at
		FROM   finance.role_permission
		ORDER  BY role_code, module
	`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("finance: get all permissions: %w", err)
	}
	defer rows.Close()

	matrix := make(PermissionMatrix)
	for rows.Next() {
		var rp RolePermission
		if err := rows.Scan(
			&rp.RoleCode, &rp.Module,
			&rp.CanView, &rp.CanCreate, &rp.CanApprove, &rp.CanExport,
			&rp.UpdatedBy, &rp.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if matrix[rp.RoleCode] == nil {
			matrix[rp.RoleCode] = make(map[string]RolePermission)
		}
		matrix[rp.RoleCode][rp.Module] = rp
	}
	return matrix, rows.Err()
}

// UpdatePermission upserts a single role+module permission row.
// Only HEAD_OF_OPERATIONS, FINOPS_MANAGER, GROUP_ADMIN should call this
// (enforced at the HTTP layer, not here).
func (s *Service) UpdatePermission(ctx context.Context, in UpdatePermissionInput, byID uuid.UUID) (RolePermission, error) {
	const q = `
		INSERT INTO finance.role_permission
		    (role_code, module, can_view, can_create, can_approve, can_export, updated_by, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (role_code, module) DO UPDATE
		SET can_view    = EXCLUDED.can_view,
		    can_create  = EXCLUDED.can_create,
		    can_approve = EXCLUDED.can_approve,
		    can_export  = EXCLUDED.can_export,
		    updated_by  = EXCLUDED.updated_by,
		    updated_at  = EXCLUDED.updated_at
		RETURNING role_code, module, can_view, can_create, can_approve, can_export, updated_by, updated_at
	`
	rp, err := scanRolePermission(s.pool.QueryRow(ctx, q,
		in.RoleCode, in.Module, in.CanView, in.CanCreate, in.CanApprove, in.CanExport, byID,
	))
	if err != nil {
		return RolePermission{}, fmt.Errorf("finance: update permission: %w", err)
	}
	return rp, nil
}
