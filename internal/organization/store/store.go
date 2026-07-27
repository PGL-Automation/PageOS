// Package store is the organization module's persistence layer over the
// sqlc-generated queries, plus raw queries that don't go through sqlc.
package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	orgdb "github.com/pagegroup/pageos/internal/organization/store/gen"
)

// Store wraps the generated Queries with a pgx pool.
// The pool is held directly so raw queries (e.g. joins across multiple tables)
// can be executed without requiring a sqlc regeneration cycle.
type Store struct {
	*orgdb.Queries
	pool *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: orgdb.New(db), pool: db}
}

// PositionInSubsidiary is the resolved view returned by GetUserPositionsInSubsidiary.
type PositionInSubsidiary struct {
	ID           uuid.UUID  `json:"id"`
	Code         string     `json:"code"`
	Title        string     `json:"title"`
	SubsidiaryID *uuid.UUID `json:"subsidiary_id,omitempty"`
	DepartmentID *uuid.UUID `json:"department_id,omitempty"`
	IsPrimary    bool       `json:"is_primary"`
}

// SubsidiaryRow is returned by GetUserSubsidiaries.
type SubsidiaryRow struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
	Name string    `json:"name"`
}

// GetUserSubsidiaries returns every subsidiary the user is currently assigned to.
// If the user holds any group-level position (position.subsidiary_id IS NULL) they
// are considered a group-wide user and all subsidiaries are returned.
func (s *Store) GetUserSubsidiaries(ctx context.Context, userID uuid.UUID) ([]SubsidiaryRow, error) {
	// First: check whether the user holds any group-level position.
	const checkGroup = `
		SELECT EXISTS (
			SELECT 1
			FROM organization.assignment a
			JOIN organization.position   pos ON pos.id  = a.position_id
			JOIN organization.person     per ON per.id  = a.person_id
			WHERE per.user_id      = $1
			  AND pos.subsidiary_id IS NULL
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var isGroupWide bool
	if err := s.pool.QueryRow(ctx, checkGroup, userID).Scan(&isGroupWide); err != nil {
		return nil, err
	}

	var q string
	if isGroupWide {
		// Return every subsidiary — group-wide user has no restriction.
		q = `SELECT id, code, name FROM organization.subsidiary ORDER BY name`
	} else {
		// Return only subsidiaries where the user has an active assignment.
		q = `
			SELECT DISTINCT s.id, s.code, s.name
			FROM organization.subsidiary s
			JOIN organization.assignment a ON a.subsidiary_id = s.id
			JOIN organization.person     p ON p.id           = a.person_id
			WHERE p.user_id      = $1
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			ORDER BY s.name
		`
	}

	rows, err := func() (interface{ Next() bool; Scan(...any) error; Err() error; Close() }, error) {
		if isGroupWide {
			return s.pool.Query(ctx, q)
		}
		return s.pool.Query(ctx, q, userID)
	}()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SubsidiaryRow
	for rows.Next() {
		var r SubsidiaryRow
		if err := rows.Scan(&r.ID, &r.Code, &r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UserWithAssignments is the combined view returned by ListUsersWithAssignments.
type UserWithAssignments struct {
	UserID      uuid.UUID  `json:"user_id"`
	Email       string     `json:"email"`
	DisplayName string     `json:"display_name"`
	UserStatus  string     `json:"user_status"`
	PersonID    *uuid.UUID `json:"person_id,omitempty"`
	Assignments []struct {
		PositionCode  string    `json:"position_code"`
		PositionTitle string    `json:"position_title"`
		SubsidiaryID  *uuid.UUID `json:"subsidiary_id,omitempty"`
		SubsidiaryName string   `json:"subsidiary_name,omitempty"`
		IsPrimary     bool      `json:"is_primary"`
		EffectiveFrom string    `json:"effective_from"`
	} `json:"assignments"`
}

// ListUsersWithAssignments returns all identity users alongside their current
// org assignments. Used by the HR user-management screen.
func (s *Store) ListUsersWithAssignments(ctx context.Context) ([]UserWithAssignments, error) {
	const q = `
		SELECT
			u.id, u.email, u.display_name, u.status,
			p.id                                                         AS person_id,
			COALESCE(pos.code,  '')                                      AS position_code,
			COALESCE(pos.title, '')                                      AS position_title,
			a.subsidiary_id,
			COALESCE(s.name,    '')                                      AS subsidiary_name,
			COALESCE(a.is_primary, false)                               AS is_primary,
			COALESCE(a.effective_from::text, '')                        AS effective_from
		FROM identity.users u
		LEFT JOIN organization.person p ON p.user_id = u.id
		LEFT JOIN organization.assignment a
			ON  a.person_id      = p.id
			AND a.effective_from <= CURRENT_DATE
			AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		LEFT JOIN organization.position pos ON pos.id = a.position_id
		LEFT JOIN organization.subsidiary s   ON s.id   = a.subsidiary_id
		ORDER BY u.display_name, a.is_primary DESC NULLS LAST
	`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Aggregate by user ID so each user appears once with all their assignments.
	byID := map[uuid.UUID]*UserWithAssignments{}
	var order []uuid.UUID

	for rows.Next() {
		var (
			userID, personID        uuid.UUID
			email, displayName, status string
			posCode, posTitle, subName, effFrom string
			subID                   *uuid.UUID
			isPrimary               bool
		)
		if err := rows.Scan(&userID, &email, &displayName, &status,
			&personID, &posCode, &posTitle, &subID, &subName, &isPrimary, &effFrom,
		); err != nil {
			return nil, err
		}
		u, ok := byID[userID]
		if !ok {
			pid := personID
			u = &UserWithAssignments{
				UserID: userID, Email: email, DisplayName: displayName,
				UserStatus: status, PersonID: &pid,
			}
			byID[userID] = u
			order = append(order, userID)
		}
		if posCode != "" {
			u.Assignments = append(u.Assignments, struct {
				PositionCode  string     `json:"position_code"`
				PositionTitle string     `json:"position_title"`
				SubsidiaryID  *uuid.UUID `json:"subsidiary_id,omitempty"`
				SubsidiaryName string    `json:"subsidiary_name,omitempty"`
				IsPrimary     bool       `json:"is_primary"`
				EffectiveFrom string     `json:"effective_from"`
			}{posCode, posTitle, subID, subName, isPrimary, effFrom})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]UserWithAssignments, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}
	return out, nil
}

// PositionRow is the view returned by GetPositionsBySubsidiary.
type PositionRow struct {
	ID           uuid.UUID  `json:"id"`
	Code         string     `json:"code"`
	Title        string     `json:"title"`
	SubsidiaryID *uuid.UUID `json:"subsidiary_id,omitempty"`
	IsGroupLevel bool       `json:"is_group_level"`
}

// OrgChartNode is a flat position row with its holders for the org chart view.
type OrgChartNode struct {
	ID                  uuid.UUID  `json:"id"`
	Code                string     `json:"code"`
	Title               string     `json:"title"`
	ReportsToPositionID *uuid.UUID `json:"reports_to_position_id,omitempty"`
	HolderNames         []string   `json:"holder_names"`
}

// GetOrgChart returns all positions for a subsidiary (or group-level if nil)
// with current holders aggregated, suitable for building an org chart tree.
func (s *Store) GetOrgChart(ctx context.Context, subsidiaryID *uuid.UUID) ([]OrgChartNode, error) {
	var q string
	var args []interface{}
	if subsidiaryID != nil {
		q = `
			SELECT
				p.id, p.code, p.title, p.reports_to_position_id,
				COALESCE(
					array_agg(u.display_name ORDER BY u.display_name)
					FILTER (WHERE u.display_name IS NOT NULL),
					'{}'::text[]
				) AS holder_names
			FROM organization.position p
			LEFT JOIN organization.assignment a
				ON  a.position_id      = p.id
				AND a.effective_from  <= CURRENT_DATE
				AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			LEFT JOIN organization.person per ON per.id = a.person_id
			LEFT JOIN identity.users u          ON u.id  = per.user_id
			WHERE p.subsidiary_id = $1
			GROUP BY p.id, p.code, p.title, p.reports_to_position_id
			ORDER BY p.title
		`
		args = []interface{}{*subsidiaryID}
	} else {
		q = `
			SELECT
				p.id, p.code, p.title, p.reports_to_position_id,
				COALESCE(
					array_agg(u.display_name ORDER BY u.display_name)
					FILTER (WHERE u.display_name IS NOT NULL),
					'{}'::text[]
				) AS holder_names
			FROM organization.position p
			LEFT JOIN organization.assignment a
				ON  a.position_id      = p.id
				AND a.effective_from  <= CURRENT_DATE
				AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			LEFT JOIN organization.person per ON per.id = a.person_id
			LEFT JOIN identity.users u          ON u.id  = per.user_id
			WHERE p.subsidiary_id IS NULL
			GROUP BY p.id, p.code, p.title, p.reports_to_position_id
			ORDER BY p.title
		`
	}
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrgChartNode
	for rows.Next() {
		var n OrgChartNode
		if err := rows.Scan(&n.ID, &n.Code, &n.Title, &n.ReportsToPositionID, &n.HolderNames); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// GetPositionsBySubsidiary returns positions for a given subsidiary plus all
// group-level positions (subsidiary_id IS NULL). If subsidiaryID is nil, every
// position in the system is returned. Used to populate the HR create-user form.
func (s *Store) GetPositionsBySubsidiary(ctx context.Context, subsidiaryID *uuid.UUID) ([]PositionRow, error) {
	var rows interface {
		Next() bool
		Scan(...any) error
		Err() error
		Close()
	}
	var err error
	if subsidiaryID != nil {
		const q = `
			SELECT id, code, title, subsidiary_id,
			       (subsidiary_id IS NULL) AS is_group_level
			FROM organization.position
			WHERE subsidiary_id = $1 OR subsidiary_id IS NULL
			ORDER BY subsidiary_id NULLS LAST, title
		`
		rows, err = s.pool.Query(ctx, q, *subsidiaryID)
	} else {
		const q = `
			SELECT id, code, title, subsidiary_id,
			       (subsidiary_id IS NULL) AS is_group_level
			FROM organization.position
			ORDER BY subsidiary_id NULLS LAST, title
		`
		rows, err = s.pool.Query(ctx, q)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PositionRow
	for rows.Next() {
		var p PositionRow
		if err := rows.Scan(&p.ID, &p.Code, &p.Title, &p.SubsidiaryID, &p.IsGroupLevel); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetUserPositionsInSubsidiary returns all positions currently held by the
// specified user within the specified subsidiary (effective today).
// Primary assignments are returned first.
func (s *Store) GetUserPositionsInSubsidiary(ctx context.Context, userID, subsidiaryID uuid.UUID) ([]PositionInSubsidiary, error) {
	const q = `
		SELECT p.id, p.code, p.title, p.subsidiary_id, p.department_id, a.is_primary
		FROM organization.assignment a
		JOIN organization.position   p   ON p.id   = a.position_id
		JOIN organization.person     per ON per.id  = a.person_id
		WHERE per.user_id      = $1
		  AND a.subsidiary_id  = $2
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		ORDER BY a.is_primary DESC
	`
	rows, err := s.pool.Query(ctx, q, userID, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PositionInSubsidiary
	for rows.Next() {
		var p PositionInSubsidiary
		if err := rows.Scan(&p.ID, &p.Code, &p.Title, &p.SubsidiaryID, &p.DepartmentID, &p.IsPrimary); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
