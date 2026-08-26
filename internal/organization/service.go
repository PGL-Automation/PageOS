// Package organization owns the org backbone: subsidiaries, departments,
// positions, people, and effective-dated assignments. Its ResolveHolders
// capability is the temporal resolver approval routing depends on.
package organization

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/pagegroup/pageos/internal/audit"
	orgdb "github.com/pagegroup/pageos/internal/organization/store/gen"
	"github.com/pagegroup/pageos/internal/organization/store"
)

// Domain types — the module's public shapes (decoupled from generated rows).

type Subsidiary struct {
	ID     uuid.UUID `json:"id"`
	Code   string    `json:"code"`
	Name   string    `json:"name"`
	Status string    `json:"status"`
}

type Department struct {
	ID           uuid.UUID `json:"id"`
	SubsidiaryID uuid.UUID `json:"subsidiary_id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
}

type Position struct {
	ID                  uuid.UUID  `json:"id"`
	SubsidiaryID        *uuid.UUID `json:"subsidiary_id,omitempty"`
	DepartmentID        *uuid.UUID `json:"department_id,omitempty"`
	Code                string     `json:"code"`
	Title               string     `json:"title"`
	ReportsToPositionID *uuid.UUID `json:"reports_to_position_id,omitempty"`
}

type Person struct {
	ID        uuid.UUID  `json:"id"`
	UserID    *uuid.UUID `json:"user_id,omitempty"`
	FirstName string     `json:"first_name"`
	LastName  string     `json:"last_name"`
	Email     string     `json:"email"`
}

type Assignment struct {
	ID            uuid.UUID  `json:"id"`
	PersonID      uuid.UUID  `json:"person_id"`
	PositionID    uuid.UUID  `json:"position_id"`
	SubsidiaryID  uuid.UUID  `json:"subsidiary_id"`
	DepartmentID  *uuid.UUID `json:"department_id,omitempty"`
	EffectiveFrom time.Time  `json:"effective_from"`
	EffectiveTo   *time.Time `json:"effective_to,omitempty"`
	IsPrimary     bool       `json:"is_primary"`
}

type Service struct {
	store *store.Store
	audit *audit.Writer
}

func NewService(s *store.Store, a *audit.Writer) *Service {
	return &Service{store: s, audit: a}
}

func (s *Service) CreateSubsidiary(ctx context.Context, code, name string) (Subsidiary, error) {
	row, err := s.store.CreateSubsidiary(ctx, orgdb.CreateSubsidiaryParams{Code: code, Name: name})
	if err != nil {
		return Subsidiary{}, err
	}
	sub := Subsidiary{ID: row.ID, Code: row.Code, Name: row.Name, Status: row.Status}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "organization.subsidiary.created",
		ResourceType: "subsidiary", ResourceID: sub.ID.String(),
	})
	return sub, nil
}

func (s *Service) ListSubsidiaries(ctx context.Context) ([]Subsidiary, error) {
	rows, err := s.store.ListSubsidiaries(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Subsidiary, 0, len(rows))
	for _, r := range rows {
		out = append(out, Subsidiary{ID: r.ID, Code: r.Code, Name: r.Name, Status: r.Status})
	}
	return out, nil
}

func (s *Service) ListDepartments(ctx context.Context, subsidiaryID *uuid.UUID) ([]Department, error) {
	rows, err := s.store.ListDepartments(ctx, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("organization: list departments: %w", err)
	}
	out := make([]Department, 0, len(rows))
	for _, r := range rows {
		out = append(out, Department{ID: r.ID, SubsidiaryID: r.SubsidiaryID, Code: r.Code, Name: r.Name})
	}
	return out, nil
}

func (s *Service) CreateDepartment(ctx context.Context, subsidiaryID uuid.UUID, code, name string) (Department, error) {
	row, err := s.store.CreateDepartment(ctx, orgdb.CreateDepartmentParams{
		SubsidiaryID: subsidiaryID, Code: code, Name: name,
	})
	if err != nil {
		return Department{}, err
	}
	return Department{ID: row.ID, SubsidiaryID: row.SubsidiaryID, Code: row.Code, Name: row.Name}, nil
}

func (s *Service) CreatePosition(ctx context.Context, subsidiaryID, departmentID *uuid.UUID, code, title string, reportsTo *uuid.UUID) (Position, error) {
	row, err := s.store.CreatePositionFull(ctx, subsidiaryID, departmentID, code, title, reportsTo)
	if err != nil {
		return Position{}, err
	}
	return Position{
		ID: row.ID, SubsidiaryID: row.SubsidiaryID,
		Code: row.Code, Title: row.Title, ReportsToPositionID: row.ReportsToPositionID,
	}, nil
}

// UpdatePosition edits a position's title and/or reporting parent.
// Pass empty title to keep the existing value; pass nil reportsTo to clear the reporting line.
func (s *Service) UpdatePosition(ctx context.Context, positionID uuid.UUID, title string, reportsTo *uuid.UUID) error {
	return s.store.UpdatePosition(ctx, positionID, title, reportsTo)
}

func (s *Service) CreatePerson(ctx context.Context, userID *uuid.UUID, first, last, email string) (Person, error) {
	row, err := s.store.CreatePerson(ctx, orgdb.CreatePersonParams{
		UserID: userID, FirstName: first, LastName: last, Email: email,
	})
	if err != nil {
		return Person{}, err
	}
	return Person{
		ID: row.ID, UserID: row.UserID, FirstName: row.FirstName,
		LastName: row.LastName, Email: row.Email,
	}, nil
}

// AssignPosition opens a new (open-ended) assignment. A promotion or transfer
// is modelled as EndAssignment on the current row + a new AssignPosition.
// managerOverride optionally sets a direct line manager, bypassing the default position hierarchy.
func (s *Service) AssignPosition(ctx context.Context, personID, positionID, subsidiaryID uuid.UUID, departmentID *uuid.UUID, effectiveFrom time.Time, isPrimary bool, managerOverride *uuid.UUID) (Assignment, error) {
	row, err := s.store.CreateAssignment(ctx, orgdb.CreateAssignmentParams{
		PersonID:      personID,
		PositionID:    positionID,
		SubsidiaryID:  subsidiaryID,
		DepartmentID:  departmentID,
		EffectiveFrom: pgtype.Date{Time: effectiveFrom, Valid: true},
		EffectiveTo:   pgtype.Date{}, // NULL => currently active
		IsPrimary:     isPrimary,
	})
	if err != nil {
		return Assignment{}, err
	}
	if managerOverride != nil {
		_ = s.store.SetAssignmentManagerOverride(ctx, row.ID, managerOverride)
	}
	a := toAssignment(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "organization.assignment.created",
		ResourceType: "assignment", ResourceID: a.ID.String(),
		Context: map[string]any{
			"person_id": personID.String(), "position_id": positionID.String(),
			"manager_override": managerOverride,
		},
	})
	return a, nil
}

// GetPositionByCode looks up a position by code within a subsidiary.
// Used by approval routing functions to resolve position IDs at runtime.
func (s *Service) GetPositionByCode(ctx context.Context, subsidiaryID uuid.UUID, code string) (Position, error) {
	row, err := s.store.GetPositionByCode(ctx, orgdb.GetPositionByCodeParams{
		SubsidiaryID: &subsidiaryID,
		Code:         code,
	})
	if err != nil {
		return Position{}, fmt.Errorf("organization: position %q not found in subsidiary: %w", code, err)
	}
	return Position{
		ID: row.ID, SubsidiaryID: row.SubsidiaryID, DepartmentID: row.DepartmentID,
		Code: row.Code, Title: row.Title,
	}, nil
}

// GetActivePositionsForUser returns the position IDs currently held by a user.
// Used by the approval service to validate that an actor can decide on a step.
func (s *Service) GetActivePositionsForUser(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	return s.store.GetActivePositionsForUser(ctx, &userID)
}

// UserPosition is the resolved view of a position held by a user in a subsidiary.
type UserPosition struct {
	ID           uuid.UUID  `json:"id"`
	Code         string     `json:"code"`
	Title        string     `json:"title"`
	SubsidiaryID *uuid.UUID `json:"subsidiary_id,omitempty"`
	DepartmentID *uuid.UUID `json:"department_id,omitempty"`
	IsPrimary    bool       `json:"is_primary"`
}

// GetUserSubsidiaries returns every subsidiary the user is assigned to.
// Group-wide users (holding a group-level position) receive all subsidiaries.
func (s *Service) GetUserSubsidiaries(ctx context.Context, userID uuid.UUID) ([]Subsidiary, error) {
	rows, err := s.store.GetUserSubsidiaries(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("organization: get user subsidiaries: %w", err)
	}
	out := make([]Subsidiary, 0, len(rows))
	for _, r := range rows {
		out = append(out, Subsidiary{ID: r.ID, Code: r.Code, Name: r.Name})
	}
	return out, nil
}

// UserWithAssignments is the HR view of a user with all their current org positions.
type UserWithAssignments = store.UserWithAssignments

// PendingGradeRow is the view returned by ListPendingGradeReview.
type PendingGradeRow = store.PendingGradeRow

// ListUsersWithAssignments returns all identity users with their active assignments.
// Used by the HR user-management screen.
func (s *Service) ListUsersWithAssignments(ctx context.Context) ([]UserWithAssignments, error) {
	return s.store.ListUsersWithAssignments(ctx)
}

// ListPendingGradeReview returns all active assignments flagged for grade confirmation.
func (s *Service) ListPendingGradeReview(ctx context.Context) ([]PendingGradeRow, error) {
	return s.store.ListPendingGradeReview(ctx)
}

// UpdateGradeLevel sets the grade level code on a person's primary active assignment
// and clears the pending_grade_review flag.
func (s *Service) UpdateGradeLevel(ctx context.Context, personID uuid.UUID, gradeCode string) error {
	if err := s.store.SetAssignmentGradeLevel(ctx, personID, gradeCode); err != nil {
		return fmt.Errorf("organization: update grade level: %w", err)
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "organization.assignment.grade_updated",
		ResourceType: "person", ResourceID: personID.String(),
		Context: map[string]any{"grade_level_code": gradeCode},
	})
	return nil
}

// PositionWithMeta is the public view returned by GetPositionsBySubsidiary.
type PositionWithMeta struct {
	ID                  uuid.UUID  `json:"id"`
	Code                string     `json:"code"`
	Title               string     `json:"title"`
	SubsidiaryID        *uuid.UUID `json:"subsidiary_id,omitempty"`
	IsGroupLevel        bool       `json:"is_group_level"`
	ReportsToTitle      string     `json:"reports_to_title,omitempty"`
	ReportsToPositionID *uuid.UUID `json:"reports_to_position_id,omitempty"`
}

// OrgChartNode is the view returned by GetOrgChart.
type OrgChartNode = store.OrgChartNode

// GetOrgChart returns all positions for a subsidiary with their current holders
// and reporting-line links. Returns group-level positions when subsidiaryID is nil.
func (s *Service) GetOrgChart(ctx context.Context, subsidiaryID *uuid.UUID) ([]OrgChartNode, error) {
	rows, err := s.store.GetOrgChart(ctx, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("organization: get org chart: %w", err)
	}
	return rows, nil
}

// GetPositionsBySubsidiary returns all positions available for a subsidiary
// (subsidiary-specific + group-level). Used by the HR user-management form.
func (s *Service) GetPositionsBySubsidiary(ctx context.Context, subsidiaryID *uuid.UUID) ([]PositionWithMeta, error) {
	rows, err := s.store.GetPositionsBySubsidiary(ctx, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("organization: get positions: %w", err)
	}
	out := make([]PositionWithMeta, 0, len(rows))
	for _, r := range rows {
		out = append(out, PositionWithMeta{
			ID: r.ID, Code: r.Code, Title: r.Title,
			SubsidiaryID: r.SubsidiaryID, IsGroupLevel: r.IsGroupLevel,
			ReportsToTitle: r.ReportsToTitle, ReportsToPositionID: r.ReportsToPositionID,
		})
	}
	return out, nil
}

// HasRole returns true if the user currently holds any position with one of the given codes.
// Used for access control on HR and admin endpoints.
func (s *Service) HasRole(ctx context.Context, userID uuid.UUID, codes ...string) (bool, error) {
	return s.store.HasRole(ctx, userID, codes)
}

// GetGroupPosition looks up a group-level position (subsidiary_id IS NULL) by code.
// Used when provisioning users into roles that span all subsidiaries.
func (s *Service) GetGroupPosition(ctx context.Context, code string) (Position, error) {
	// Use the raw store method that queries with IS NULL — the generated
	// GetPositionByCode uses "= $1" which never matches NULL in PostgreSQL.
	row, err := s.store.GetGroupPositionByCode(ctx, code)
	if err != nil {
		return Position{}, fmt.Errorf("organization: group position %q not found: %w", code, err)
	}
	return Position{
		ID: row.ID, SubsidiaryID: row.SubsidiaryID, DepartmentID: row.DepartmentID,
		Code: row.Code, Title: row.Title,
	}, nil
}

// GetUserPositionsInSubsidiary returns all positions currently held by a user
// within a specific subsidiary. Used by the frontend to resolve role-based navigation.
func (s *Service) GetUserPositionsInSubsidiary(ctx context.Context, userID, subsidiaryID uuid.UUID) ([]UserPosition, error) {
	rows, err := s.store.GetUserPositionsInSubsidiary(ctx, userID, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("organization: get user positions: %w", err)
	}
	out := make([]UserPosition, 0, len(rows))
	for _, r := range rows {
		out = append(out, UserPosition{
			ID: r.ID, Code: r.Code, Title: r.Title,
			SubsidiaryID: r.SubsidiaryID, DepartmentID: r.DepartmentID,
			IsPrimary: r.IsPrimary,
		})
	}
	return out, nil
}

// ResolveHolders returns the people holding a position on a given date — the
// core primitive for position-based approval routing.
func (s *Service) ResolveHolders(ctx context.Context, positionID uuid.UUID, onDate time.Time) ([]Person, error) {
	rows, err := s.store.ResolveHolders(ctx, orgdb.ResolveHoldersParams{
		PositionID:    positionID,
		EffectiveFrom: pgtype.Date{Time: onDate, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]Person, 0, len(rows))
	for _, r := range rows {
		out = append(out, Person{
			ID: r.ID, UserID: r.UserID, FirstName: r.FirstName,
			LastName: r.LastName, Email: r.Email,
		})
	}
	return out, nil
}

func toAssignment(row orgdb.OrganizationAssignment) Assignment {
	a := Assignment{
		ID: row.ID, PersonID: row.PersonID, PositionID: row.PositionID,
		SubsidiaryID: row.SubsidiaryID, DepartmentID: row.DepartmentID,
		IsPrimary: row.IsPrimary,
	}
	if row.EffectiveFrom.Valid {
		a.EffectiveFrom = row.EffectiveFrom.Time
	}
	if row.EffectiveTo.Valid {
		t := row.EffectiveTo.Time
		a.EffectiveTo = &t
	}
	return a
}
