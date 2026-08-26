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

// GetGroupPositionByCode looks up a group-level position (subsidiary_id IS NULL)
// by code. The generated GetPositionByCode uses "= $1" which never matches NULL
// in PostgreSQL; this raw query uses IS NULL instead.
func (s *Store) GetGroupPositionByCode(ctx context.Context, code string) (orgdb.OrganizationPosition, error) {
	const q = `
		SELECT id, subsidiary_id, department_id, code, title, created_at
		FROM organization.position
		WHERE subsidiary_id IS NULL AND code = $1
		LIMIT 1
	`
	var p orgdb.OrganizationPosition
	err := s.pool.QueryRow(ctx, q, code).Scan(
		&p.ID, &p.SubsidiaryID, &p.DepartmentID, &p.Code, &p.Title, &p.CreatedAt,
	)
	return p, err
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
	UserID           uuid.UUID  `json:"user_id"`
	Email            string     `json:"email"`
	DisplayName      string     `json:"display_name"`
	UserStatus       string     `json:"user_status"`
	PersonID         *uuid.UUID `json:"person_id,omitempty"`
	HomeOrganization string     `json:"home_organization,omitempty"`
	Assignments      []struct {
		PositionCode       string     `json:"position_code"`
		PositionTitle      string     `json:"position_title"`
		SubsidiaryID       *uuid.UUID `json:"subsidiary_id,omitempty"`
		SubsidiaryName     string     `json:"subsidiary_name,omitempty"`
		IsPrimary          bool       `json:"is_primary"`
		EffectiveFrom      string     `json:"effective_from"`
		EmploymentType     string     `json:"employment_type"`
		GradeLevelCode     string     `json:"grade_level_code,omitempty"`
		GradeLevelName     string     `json:"grade_level_name,omitempty"`
		PendingGradeReview bool       `json:"pending_grade_review"`
	} `json:"assignments"`
}

// PendingGradeRow is returned by ListPendingGradeReview.
type PendingGradeRow struct {
	AssignmentID   uuid.UUID `json:"assignment_id"`
	PersonID       uuid.UUID `json:"person_id"`
	DisplayName    string    `json:"display_name"`
	Email          string    `json:"email"`
	SubsidiaryName string    `json:"subsidiary_name"`
	PositionTitle  string    `json:"position_title"`
	GradeLevelCode string    `json:"grade_level_code"`
	GradeLevelName string    `json:"grade_level_name"`
}

// ListUsersWithAssignments returns every person who has an active assignment,
// regardless of whether they have a login account yet.
// Persons without a login account get user_id = uuid.Nil and user_status = "no_account".
func (s *Store) ListUsersWithAssignments(ctx context.Context) ([]UserWithAssignments, error) {
	const q = `
		SELECT
			-- user account (may be absent for staff seeded without a login)
			COALESCE(u.id,           '00000000-0000-0000-0000-000000000000'::uuid) AS user_id,
			COALESCE(u.email,        p.email)                                      AS email,
			COALESCE(u.display_name, p.first_name || ' ' || p.last_name)          AS display_name,
			COALESCE(u.status,       'no_account')                                 AS user_status,
			-- person
			p.id                                                                   AS person_id,
			COALESCE(p.home_organization, '')                                      AS home_organization,
			-- assignment + position
			COALESCE(pos.code,  '')                                                AS position_code,
			COALESCE(pos.title, '')                                                AS position_title,
			a.subsidiary_id,
			COALESCE(s.name,    '')                                                AS subsidiary_name,
			COALESCE(a.is_primary, false)                                          AS is_primary,
			COALESCE(a.effective_from::text, '')                                   AS effective_from,
			COALESCE(a.employment_type, 'permanent')                               AS employment_type,
			COALESCE(a.grade_level_code, '')                                       AS grade_level_code,
			COALESCE(gl.display_name, '')                                          AS grade_level_name,
			COALESCE(a.pending_grade_review, false)                                AS pending_grade_review
		FROM organization.person p
		LEFT JOIN identity.users u ON u.id = p.user_id
		JOIN organization.assignment a
			ON  a.person_id      = p.id
			AND a.effective_from <= CURRENT_DATE
			AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		LEFT JOIN organization.position   pos ON pos.id  = a.position_id
		LEFT JOIN organization.subsidiary s   ON s.id    = a.subsidiary_id
		LEFT JOIN organization.grade_level gl ON gl.code = a.grade_level_code
		ORDER BY COALESCE(u.display_name, p.first_name || ' ' || p.last_name),
		         a.is_primary DESC NULLS LAST
	`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Key by person_id — user_id is not guaranteed unique (no-account staff share uuid.Nil).
	byPerson := map[uuid.UUID]*UserWithAssignments{}
	var order []uuid.UUID

	for rows.Next() {
		var (
			userID, personID                     uuid.UUID
			email, displayName, status, homeOrg  string
			posCode, posTitle, subName, effFrom  string
			employmentType, gradeCode, gradeName string
			subID                                *uuid.UUID
			isPrimary, pendingGrade              bool
		)
		if err := rows.Scan(
			&userID, &email, &displayName, &status,
			&personID, &homeOrg,
			&posCode, &posTitle, &subID, &subName, &isPrimary, &effFrom,
			&employmentType, &gradeCode, &gradeName, &pendingGrade,
		); err != nil {
			return nil, err
		}
		u, ok := byPerson[personID]
		if !ok {
			uid := userID
			pid := personID
			u = &UserWithAssignments{
				UserID: uid, Email: email, DisplayName: displayName,
				UserStatus: status, PersonID: &pid, HomeOrganization: homeOrg,
			}
			byPerson[personID] = u
			order = append(order, personID)
		}
		if posCode != "" {
			u.Assignments = append(u.Assignments, struct {
				PositionCode       string     `json:"position_code"`
				PositionTitle      string     `json:"position_title"`
				SubsidiaryID       *uuid.UUID `json:"subsidiary_id,omitempty"`
				SubsidiaryName     string     `json:"subsidiary_name,omitempty"`
				IsPrimary          bool       `json:"is_primary"`
				EffectiveFrom      string     `json:"effective_from"`
				EmploymentType     string     `json:"employment_type"`
				GradeLevelCode     string     `json:"grade_level_code,omitempty"`
				GradeLevelName     string     `json:"grade_level_name,omitempty"`
				PendingGradeReview bool       `json:"pending_grade_review"`
			}{posCode, posTitle, subID, subName, isPrimary, effFrom,
				employmentType, gradeCode, gradeName, pendingGrade})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]UserWithAssignments, 0, len(order))
	for _, id := range order {
		out = append(out, *byPerson[id])
	}
	return out, nil
}

// ListPendingGradeReview returns all active assignments flagged for grade confirmation.
func (s *Store) ListPendingGradeReview(ctx context.Context) ([]PendingGradeRow, error) {
	const q = `
		SELECT
			a.id                      AS assignment_id,
			p.id                      AS person_id,
			COALESCE(u.display_name, p.first_name || ' ' || p.last_name) AS display_name,
			p.email,
			COALESCE(s.name, '')      AS subsidiary_name,
			COALESCE(pos.title, '')   AS position_title,
			COALESCE(a.grade_level_code, '')  AS grade_level_code,
			COALESCE(gl.display_name, '')     AS grade_level_name
		FROM organization.assignment a
		JOIN organization.person p      ON p.id    = a.person_id
		LEFT JOIN identity.users u      ON u.id    = p.user_id
		LEFT JOIN organization.position pos ON pos.id  = a.position_id
		LEFT JOIN organization.subsidiary s ON s.id    = a.subsidiary_id
		LEFT JOIN organization.grade_level gl ON gl.code = a.grade_level_code
		WHERE a.pending_grade_review = true
		  AND a.effective_to IS NULL
		ORDER BY p.last_name, p.first_name
	`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingGradeRow
	for rows.Next() {
		var r PendingGradeRow
		if err := rows.Scan(&r.AssignmentID, &r.PersonID, &r.DisplayName, &r.Email,
			&r.SubsidiaryName, &r.PositionTitle, &r.GradeLevelCode, &r.GradeLevelName); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetAssignmentGradeLevel updates the grade on the person's current primary assignment
// and clears the pending_grade_review flag.
func (s *Store) SetAssignmentGradeLevel(ctx context.Context, personID uuid.UUID, gradeCode string) error {
	const q = `
		UPDATE organization.assignment
		SET    grade_level_code     = $1,
		       pending_grade_review = false
		WHERE  person_id            = $2
		  AND  effective_to         IS NULL
		  AND  is_primary           = true
	`
	_, err := s.pool.Exec(ctx, q, gradeCode, personID)
	return err
}

// PositionRow is the view returned by GetPositionsBySubsidiary.
type PositionRow struct {
	ID                  uuid.UUID  `json:"id"`
	Code                string     `json:"code"`
	Title               string     `json:"title"`
	SubsidiaryID        *uuid.UUID `json:"subsidiary_id,omitempty"`
	IsGroupLevel        bool       `json:"is_group_level"`
	ReportsToTitle      string     `json:"reports_to_title,omitempty"`
	ReportsToPositionID *uuid.UUID `json:"reports_to_position_id,omitempty"`
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
					array_agg(DISTINCT u.display_name)
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
		// No subsidiary filter — return ALL positions across all entities so the
		// "All Entities" view reflects every member of staff.
		q = `
			SELECT
				p.id, p.code, p.title, p.reports_to_position_id,
				COALESCE(
					array_agg(DISTINCT u.display_name)
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
			SELECT p.id, p.code, p.title, p.subsidiary_id,
			       (p.subsidiary_id IS NULL) AS is_group_level,
			       COALESCE(parent.title, '') AS reports_to_title,
			       p.reports_to_position_id
			FROM organization.position p
			LEFT JOIN organization.position parent ON parent.id = p.reports_to_position_id
			WHERE p.subsidiary_id = $1 OR p.subsidiary_id IS NULL
			ORDER BY p.subsidiary_id NULLS LAST, p.title
		`
		rows, err = s.pool.Query(ctx, q, *subsidiaryID)
	} else {
		const q = `
			SELECT p.id, p.code, p.title, p.subsidiary_id,
			       (p.subsidiary_id IS NULL) AS is_group_level,
			       COALESCE(parent.title, '') AS reports_to_title,
			       p.reports_to_position_id
			FROM organization.position p
			LEFT JOIN organization.position parent ON parent.id = p.reports_to_position_id
			ORDER BY p.subsidiary_id NULLS LAST, p.title
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
		if err := rows.Scan(&p.ID, &p.Code, &p.Title, &p.SubsidiaryID, &p.IsGroupLevel, &p.ReportsToTitle, &p.ReportsToPositionID); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CreatePositionFull inserts a new position and optionally sets its reporting parent.
func (s *Store) CreatePositionFull(ctx context.Context, subsidiaryID, departmentID *uuid.UUID, code, title string, reportsTo *uuid.UUID) (PositionRow, error) {
	var p PositionRow
	const insertQ = `
		INSERT INTO organization.position (subsidiary_id, department_id, code, title)
		VALUES ($1, $2, $3, $4)
		RETURNING id, code, title, subsidiary_id, (subsidiary_id IS NULL), '', NULL
	`
	if err := s.pool.QueryRow(ctx, insertQ, subsidiaryID, departmentID, code, title).
		Scan(&p.ID, &p.Code, &p.Title, &p.SubsidiaryID, &p.IsGroupLevel, &p.ReportsToTitle, &p.ReportsToPositionID); err != nil {
		return PositionRow{}, err
	}
	if reportsTo != nil {
		if err := s.UpdatePosition(ctx, p.ID, "", reportsTo); err != nil {
			return p, err
		}
		p.ReportsToPositionID = reportsTo
	}
	return p, nil
}

// UpdatePosition updates a position's title (if non-empty) and reporting parent.
// Pass nil reportsTo to clear the reporting line (top of hierarchy).
func (s *Store) UpdatePosition(ctx context.Context, positionID uuid.UUID, title string, reportsTo *uuid.UUID) error {
	const q = `
		UPDATE organization.position
		SET    title                  = CASE WHEN $1 != '' THEN $1 ELSE title END,
		       reports_to_position_id = $2
		WHERE  id = $3
	`
	_, err := s.pool.Exec(ctx, q, title, reportsTo, positionID)
	return err
}

// SetAssignmentManagerOverride sets (or clears) the direct manager override on an assignment.
func (s *Store) SetAssignmentManagerOverride(ctx context.Context, assignmentID uuid.UUID, managerPersonID *uuid.UUID) error {
	const q = `UPDATE organization.assignment SET manager_override_person_id = $1 WHERE id = $2`
	_, err := s.pool.Exec(ctx, q, managerPersonID, assignmentID)
	return err
}

// HasRole returns true if the user currently holds any position with one of the given codes.
func (s *Store) HasRole(ctx context.Context, userID uuid.UUID, codes []string) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM organization.assignment a
			JOIN organization.position pos ON pos.id = a.position_id
			JOIN organization.person per ON per.id = a.person_id
			WHERE per.user_id = $1
			  AND pos.code = ANY($2::text[])
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var exists bool
	err := s.pool.QueryRow(ctx, q, userID, codes).Scan(&exists)
	return exists, err
}

// DepartmentRow is returned by ListDepartments.
type DepartmentRow struct {
	ID           uuid.UUID `json:"id"`
	SubsidiaryID uuid.UUID `json:"subsidiary_id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
}

// ListDepartments returns all departments, optionally filtered by subsidiary.
func (s *Store) ListDepartments(ctx context.Context, subsidiaryID *uuid.UUID) ([]DepartmentRow, error) {
	const q = `SELECT id, subsidiary_id, code, name FROM organization.department WHERE ($1::uuid IS NULL OR subsidiary_id = $1) ORDER BY name`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DepartmentRow
	for rows.Next() {
		var d DepartmentRow
		if err := rows.Scan(&d.ID, &d.SubsidiaryID, &d.Code, &d.Name); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetUserPositionsInSubsidiary returns all positions currently held by the
// specified user within the specified subsidiary (effective today).
// Group-level positions (position.subsidiary_id IS NULL) are always included
// regardless of which subsidiary is queried — they span the whole organisation.
// Primary assignments are returned first; DISTINCT ON avoids duplicates when a
// group-level position is assigned across multiple subsidiaries.
func (s *Store) GetUserPositionsInSubsidiary(ctx context.Context, userID, subsidiaryID uuid.UUID) ([]PositionInSubsidiary, error) {
	const q = `
		SELECT DISTINCT ON (p.id)
		       p.id, p.code, p.title, p.subsidiary_id, p.department_id, a.is_primary
		FROM organization.assignment a
		JOIN organization.position   p   ON p.id   = a.position_id
		JOIN organization.person     per ON per.id  = a.person_id
		WHERE per.user_id      = $1
		  AND (
		      a.subsidiary_id  = $2
		      OR p.subsidiary_id IS NULL
		  )
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		ORDER BY p.id, a.is_primary DESC
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
