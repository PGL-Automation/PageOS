// Package appraisal manages performance appraisal cycles, questions, reviewer
// assignments, self-assessments, and manager reviews for Page Group entities.
package appraisal

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Cycle is a named performance appraisal period.
type Cycle struct {
	ID                 uuid.UUID  `json:"id"`
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	SubsidiaryID       *uuid.UUID `json:"subsidiary_id,omitempty"`
	Status             string     `json:"status"` // draft|open|closed|archived
	SelfDeadline       *time.Time `json:"self_deadline,omitempty"`
	ManagerDeadline    *time.Time `json:"manager_deadline,omitempty"`
	OpenedAt           *time.Time `json:"opened_at,omitempty"`
	ClosedAt           *time.Time `json:"closed_at,omitempty"`
	CreatedBy          uuid.UUID  `json:"created_by"`
	CreatedAt          time.Time  `json:"created_at"`
	QuestionCount      int        `json:"question_count"`
	SubmissionCount    int        `json:"submission_count"`
	SelfSubmittedCount int        `json:"self_submitted_count"`
	CompletedCount     int        `json:"completed_count"`
}

// Question is a single scored item within an appraisal cycle.
type Question struct {
	ID          uuid.UUID `json:"id"`
	CycleID     uuid.UUID `json:"cycle_id"`
	Category    string    `json:"category"`
	Text        string    `json:"text"`
	Description string    `json:"description"`
	MaxScore    int       `json:"max_score"`
	Weight      float64   `json:"weight"`
	OrderIndex  int       `json:"order_index"`
	CreatedAt   time.Time `json:"created_at"`
}

// Submission tracks one appraisee's journey through a cycle.
type Submission struct {
	ID                 uuid.UUID  `json:"id"`
	CycleID            uuid.UUID  `json:"cycle_id"`
	CycleTitle         string     `json:"cycle_title,omitempty"`
	AppraiseeID        uuid.UUID  `json:"appraisee_id"`
	AppraiseeEmail     string     `json:"appraisee_email,omitempty"`
	AppraiseeName      string     `json:"appraisee_name,omitempty"`
	ReviewerID         *uuid.UUID `json:"reviewer_id,omitempty"`
	ReviewerName       string     `json:"reviewer_name,omitempty"`
	Status             string     `json:"status"`
	SelfScore          *float64   `json:"self_score,omitempty"`
	ManagerScore       *float64   `json:"manager_score,omitempty"`
	SelfSubmittedAt    *time.Time `json:"self_submitted_at,omitempty"`
	ManagerSubmittedAt *time.Time `json:"manager_submitted_at,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// Response is a single question score recorded by either the appraisee or the reviewer.
type Response struct {
	ID           uuid.UUID `json:"id"`
	SubmissionID uuid.UUID `json:"submission_id"`
	QuestionID   uuid.UUID `json:"question_id"`
	ScorerID     uuid.UUID `json:"scorer_id"`
	ScorerType   string    `json:"scorer_type"` // self|manager
	Score        float64   `json:"score"`
	Comment      string    `json:"comment"`
	ScoredAt     time.Time `json:"scored_at"`
}

// ReviewerAssignment links a reviewer to an appraisee for a given cycle.
type ReviewerAssignment struct {
	ID             uuid.UUID `json:"id"`
	CycleID        uuid.UUID `json:"cycle_id"`
	AppraiseeID    uuid.UUID `json:"appraisee_id"`
	AppraiseeName  string    `json:"appraisee_name,omitempty"`
	AppraiseeEmail string    `json:"appraisee_email,omitempty"`
	ReviewerID     uuid.UUID `json:"reviewer_id"`
	ReviewerName   string    `json:"reviewer_name,omitempty"`
	AssignedAt     time.Time `json:"assigned_at"`
}

// SubmissionDetail enriches a Submission with its questions and all responses.
type SubmissionDetail struct {
	Submission
	Questions        []Question `json:"questions"`
	SelfResponses    []Response `json:"self_responses"`
	ManagerResponses []Response `json:"manager_responses"`
}

// QuestionInput carries the mutable fields for creating or updating a Question.
type QuestionInput struct {
	Category   string
	Text       string
	Description string
	MaxScore   int
	Weight     float64
	OrderIndex int
}

// ResponseInput carries a single question score for an upsert operation.
type ResponseInput struct {
	QuestionID uuid.UUID
	Score      float64
	Comment    string
}

// Service is the appraisal domain service.
type Service struct {
	pool *pgxpool.Pool
}

// NewService constructs a Service backed by the given pgxpool.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// -------------------------------------------------------------------------
// Cycle methods
// -------------------------------------------------------------------------

// CreateCycle inserts a new appraisal cycle in draft status.
func (s *Service) CreateCycle(ctx context.Context, title, desc string, subsidiaryID *uuid.UUID, selfDeadline, managerDeadline *time.Time, createdBy uuid.UUID) (Cycle, error) {
	const q = `
		INSERT INTO appraisal.cycle (
			id, title, description, subsidiary_id,
			status, self_deadline, manager_deadline, created_by, created_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3,
			'draft', $4, $5, $6, now()
		)
		RETURNING id, title, description, subsidiary_id,
		          status, self_deadline, manager_deadline,
		          opened_at, closed_at, created_by, created_at
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q,
		title, desc, subsidiaryID,
		selfDeadline, managerDeadline, createdBy,
	).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: create cycle: %w", err)
	}
	return c, nil
}

// ListCycles returns all cycles optionally scoped to a subsidiary, with stats.
func (s *Service) ListCycles(ctx context.Context, subsidiaryID *uuid.UUID) ([]Cycle, error) {
	const q = `
		SELECT
			c.id, c.title, c.description, c.subsidiary_id,
			c.status, c.self_deadline, c.manager_deadline,
			c.opened_at, c.closed_at, c.created_by, c.created_at,
			(SELECT COUNT(*) FROM appraisal.question  q2 WHERE q2.cycle_id = c.id)                                  AS question_count,
			(SELECT COUNT(*) FROM appraisal.submission s2 WHERE s2.cycle_id = c.id)                                 AS submission_count,
			(SELECT COUNT(*) FROM appraisal.submission s3 WHERE s3.cycle_id = c.id AND s3.status IN ('self_submitted','manager_scoring','completed')) AS self_submitted_count,
			(SELECT COUNT(*) FROM appraisal.submission s4 WHERE s4.cycle_id = c.id AND s4.status = 'completed')     AS completed_count
		FROM appraisal.cycle c
		WHERE ($1::uuid IS NULL OR c.subsidiary_id = $1)
		ORDER BY c.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list cycles: %w", err)
	}
	defer rows.Close()

	out := make([]Cycle, 0)
	for rows.Next() {
		var c Cycle
		if err := rows.Scan(
			&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
			&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
			&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
			&c.QuestionCount, &c.SubmissionCount, &c.SelfSubmittedCount, &c.CompletedCount,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list cycles scan: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCycle returns a single cycle by ID with its stats.
func (s *Service) GetCycle(ctx context.Context, id uuid.UUID) (Cycle, error) {
	const q = `
		SELECT
			c.id, c.title, c.description, c.subsidiary_id,
			c.status, c.self_deadline, c.manager_deadline,
			c.opened_at, c.closed_at, c.created_by, c.created_at,
			(SELECT COUNT(*) FROM appraisal.question  q2 WHERE q2.cycle_id = c.id)                                  AS question_count,
			(SELECT COUNT(*) FROM appraisal.submission s2 WHERE s2.cycle_id = c.id)                                 AS submission_count,
			(SELECT COUNT(*) FROM appraisal.submission s3 WHERE s3.cycle_id = c.id AND s3.status IN ('self_submitted','manager_scoring','completed')) AS self_submitted_count,
			(SELECT COUNT(*) FROM appraisal.submission s4 WHERE s4.cycle_id = c.id AND s4.status = 'completed')     AS completed_count
		FROM appraisal.cycle c
		WHERE c.id = $1
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
		&c.QuestionCount, &c.SubmissionCount, &c.SelfSubmittedCount, &c.CompletedCount,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: get cycle: %w", err)
	}
	return c, nil
}

// UpdateCycle updates mutable cycle fields; only permitted while status=draft.
func (s *Service) UpdateCycle(ctx context.Context, id uuid.UUID, title, desc string, selfDeadline, managerDeadline *time.Time) (Cycle, error) {
	const q = `
		UPDATE appraisal.cycle
		SET title = $2, description = $3, self_deadline = $4, manager_deadline = $5
		WHERE id = $1 AND status = 'draft'
		RETURNING id, title, description, subsidiary_id,
		          status, self_deadline, manager_deadline,
		          opened_at, closed_at, created_by, created_at
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q, id, title, desc, selfDeadline, managerDeadline).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: update cycle: %w", err)
	}
	return c, nil
}

// OpenCycle transitions a cycle from draft to open and records the opened_at timestamp.
func (s *Service) OpenCycle(ctx context.Context, id, callerID uuid.UUID) (Cycle, error) {
	_ = callerID // reserved for audit
	const q = `
		UPDATE appraisal.cycle
		SET status = 'open', opened_at = now()
		WHERE id = $1 AND status = 'draft'
		RETURNING id, title, description, subsidiary_id,
		          status, self_deadline, manager_deadline,
		          opened_at, closed_at, created_by, created_at
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: open cycle: %w", err)
	}
	return c, nil
}

// CloseCycle transitions a cycle from open to closed and records closed_at.
func (s *Service) CloseCycle(ctx context.Context, id, callerID uuid.UUID) (Cycle, error) {
	_ = callerID // reserved for audit
	const q = `
		UPDATE appraisal.cycle
		SET status = 'closed', closed_at = now()
		WHERE id = $1 AND status = 'open'
		RETURNING id, title, description, subsidiary_id,
		          status, self_deadline, manager_deadline,
		          opened_at, closed_at, created_by, created_at
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: close cycle: %w", err)
	}
	return c, nil
}

// ArchiveCycle transitions a closed cycle to archived status.
// Archived cycles are read-only and preserved for historical record.
func (s *Service) ArchiveCycle(ctx context.Context, id, callerID uuid.UUID) (Cycle, error) {
	_ = callerID
	const q = `
		UPDATE appraisal.cycle
		SET status = 'archived'
		WHERE id = $1 AND status = 'closed'
		RETURNING id, title, description, subsidiary_id,
		          status, self_deadline, manager_deadline,
		          opened_at, closed_at, created_by, created_at
	`
	var c Cycle
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&c.ID, &c.Title, &c.Description, &c.SubsidiaryID,
		&c.Status, &c.SelfDeadline, &c.ManagerDeadline,
		&c.OpenedAt, &c.ClosedAt, &c.CreatedBy, &c.CreatedAt,
	)
	if err != nil {
		return Cycle{}, fmt.Errorf("appraisal: archive cycle (must be closed first): %w", err)
	}
	return c, nil
}

// -------------------------------------------------------------------------
// Question methods
// -------------------------------------------------------------------------

// AddQuestion appends a scored question to a cycle.
func (s *Service) AddQuestion(ctx context.Context, cycleID uuid.UUID, q QuestionInput, createdBy uuid.UUID) (Question, error) {
	const sql = `
		INSERT INTO appraisal.question (
			id, cycle_id, category, text, description,
			max_score, weight, order_index, created_by, created_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4,
			$5, $6, $7, $8, now()
		)
		RETURNING id, cycle_id, category, text, description,
		          max_score, weight, order_index, created_at
	`
	var out Question
	err := s.pool.QueryRow(ctx, sql,
		cycleID, q.Category, q.Text, q.Description,
		q.MaxScore, q.Weight, q.OrderIndex, createdBy,
	).Scan(
		&out.ID, &out.CycleID, &out.Category, &out.Text, &out.Description,
		&out.MaxScore, &out.Weight, &out.OrderIndex, &out.CreatedAt,
	)
	if err != nil {
		return Question{}, fmt.Errorf("appraisal: add question: %w", err)
	}
	return out, nil
}

// ListQuestions returns all questions for a cycle ordered by category then order_index.
func (s *Service) ListQuestions(ctx context.Context, cycleID uuid.UUID) ([]Question, error) {
	const sql = `
		SELECT id, cycle_id, category, text, description,
		       max_score, weight, order_index, created_at
		FROM appraisal.question
		WHERE cycle_id = $1
		ORDER BY category, order_index
	`
	rows, err := s.pool.Query(ctx, sql, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list questions: %w", err)
	}
	defer rows.Close()

	out := make([]Question, 0)
	for rows.Next() {
		var q Question
		if err := rows.Scan(
			&q.ID, &q.CycleID, &q.Category, &q.Text, &q.Description,
			&q.MaxScore, &q.Weight, &q.OrderIndex, &q.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list questions scan: %w", err)
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// UpdateQuestion updates the mutable fields of a question.
func (s *Service) UpdateQuestion(ctx context.Context, id uuid.UUID, q QuestionInput) (Question, error) {
	const sql = `
		UPDATE appraisal.question
		SET category = $2, text = $3, description = $4,
		    max_score = $5, weight = $6, order_index = $7
		WHERE id = $1
		RETURNING id, cycle_id, category, text, description,
		          max_score, weight, order_index, created_at
	`
	var out Question
	err := s.pool.QueryRow(ctx, sql,
		id, q.Category, q.Text, q.Description,
		q.MaxScore, q.Weight, q.OrderIndex,
	).Scan(
		&out.ID, &out.CycleID, &out.Category, &out.Text, &out.Description,
		&out.MaxScore, &out.Weight, &out.OrderIndex, &out.CreatedAt,
	)
	if err != nil {
		return Question{}, fmt.Errorf("appraisal: update question: %w", err)
	}
	return out, nil
}

// DeleteQuestion removes a question; only allowed when its cycle is in draft.
func (s *Service) DeleteQuestion(ctx context.Context, id uuid.UUID) error {
	const sql = `
		DELETE FROM appraisal.question q
		USING appraisal.cycle c
		WHERE q.id = $1
		  AND q.cycle_id = c.id
		  AND c.status = 'draft'
	`
	tag, err := s.pool.Exec(ctx, sql, id)
	if err != nil {
		return fmt.Errorf("appraisal: delete question: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("appraisal: delete question: not found or cycle is not in draft")
	}
	return nil
}

// -------------------------------------------------------------------------
// Reviewer assignment methods
// -------------------------------------------------------------------------

// AssignReviewer upserts a reviewer assignment for an appraisee in a cycle.
func (s *Service) AssignReviewer(ctx context.Context, cycleID, appraiseeID, reviewerID, assignedBy uuid.UUID) (ReviewerAssignment, error) {
	const sql = `
		INSERT INTO appraisal.reviewer_assignment (
			id, cycle_id, appraisee_id, reviewer_id, assigned_by, assigned_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, now()
		)
		ON CONFLICT (cycle_id, appraisee_id)
		DO UPDATE SET reviewer_id = EXCLUDED.reviewer_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
		RETURNING id, cycle_id, appraisee_id, reviewer_id, assigned_at
	`
	var ra ReviewerAssignment
	err := s.pool.QueryRow(ctx, sql, cycleID, appraiseeID, reviewerID, assignedBy).Scan(
		&ra.ID, &ra.CycleID, &ra.AppraiseeID, &ra.ReviewerID, &ra.AssignedAt,
	)
	if err != nil {
		return ReviewerAssignment{}, fmt.Errorf("appraisal: assign reviewer: %w", err)
	}
	ra.CycleID = cycleID
	// Populate display names.
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(u.display_name,''), u.email FROM identity.users u WHERE u.id = $1`,
		appraiseeID,
	).Scan(&ra.AppraiseeName, &ra.AppraiseeEmail)
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(u.display_name,'') FROM identity.users u WHERE u.id = $1`,
		reviewerID,
	).Scan(&ra.ReviewerName)
	return ra, nil
}

// ListAssignments returns all reviewer assignments for a cycle with display names.
func (s *Service) ListAssignments(ctx context.Context, cycleID uuid.UUID) ([]ReviewerAssignment, error) {
	const sql = `
		SELECT
			ra.id, ra.cycle_id, ra.appraisee_id,
			COALESCE(ua.display_name, '') AS appraisee_name,
			COALESCE(ua.email, '')        AS appraisee_email,
			ra.reviewer_id,
			COALESCE(ur.display_name, '') AS reviewer_name,
			ra.assigned_at
		FROM appraisal.reviewer_assignment ra
		JOIN identity.users ua ON ua.id = ra.appraisee_id
		JOIN identity.users ur ON ur.id = ra.reviewer_id
		WHERE ra.cycle_id = $1
		ORDER BY ua.display_name
	`
	rows, err := s.pool.Query(ctx, sql, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list assignments: %w", err)
	}
	defer rows.Close()

	out := make([]ReviewerAssignment, 0)
	for rows.Next() {
		var ra ReviewerAssignment
		if err := rows.Scan(
			&ra.ID, &ra.CycleID, &ra.AppraiseeID,
			&ra.AppraiseeName, &ra.AppraiseeEmail,
			&ra.ReviewerID, &ra.ReviewerName, &ra.AssignedAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list assignments scan: %w", err)
		}
		out = append(out, ra)
	}
	return out, rows.Err()
}

// RemoveAssignment deletes a reviewer assignment by ID.
func (s *Service) RemoveAssignment(ctx context.Context, id uuid.UUID) error {
	const sql = `DELETE FROM appraisal.reviewer_assignment WHERE id = $1`
	tag, err := s.pool.Exec(ctx, sql, id)
	if err != nil {
		return fmt.Errorf("appraisal: remove assignment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("appraisal: remove assignment: not found")
	}
	return nil
}

// AutoAssignFromOrgChart bulk-assigns reviewers by walking the org chart.
// For each active user in the cycle's subsidiary scope, it finds the holder of
// the parent position (reports_to_position_id) and assigns them as reviewer.
// Returns AutoAssignResult with the count assigned and a list of skipped users
// who could not be auto-assigned (top-of-hierarchy or vacant parent positions).
func (s *Service) AutoAssignFromOrgChart(ctx context.Context, cycleID, assignedBy uuid.UUID) (AutoAssignResult, error) {
	// 1. Resolve subsidiary scope for the cycle.
	var subsidiaryID *uuid.UUID
	{
		var sid uuid.UUID
		var isNull bool
		err := s.pool.QueryRow(ctx,
			`SELECT subsidiary_id IS NULL, subsidiary_id FROM appraisal.cycle WHERE id = $1`,
			cycleID,
		).Scan(&isNull, &sid)
		if err != nil {
			return AutoAssignResult{}, fmt.Errorf("appraisal: auto-assign: resolve cycle: %w", err)
		}
		if !isNull {
			subsidiaryID = &sid
		}
	}

	// 2. For every active user in scope find their primary position and its
	//    parent position holder.
	const assignSQL = `
		SELECT
			per.user_id                    AS appraisee_user_id,
			parent_per.user_id             AS reviewer_user_id
		FROM organization.assignment a
		JOIN organization.position   pos        ON pos.id        = a.position_id
		JOIN organization.person     per        ON per.id        = a.person_id
		JOIN organization.position   parent_pos ON parent_pos.id = pos.reports_to_position_id
		JOIN organization.assignment parent_a
			ON  parent_a.position_id    = parent_pos.id
			AND parent_a.effective_from <= CURRENT_DATE
			AND (parent_a.effective_to IS NULL OR parent_a.effective_to >= CURRENT_DATE)
		JOIN organization.person parent_per ON parent_per.id = parent_a.person_id
		WHERE a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		  AND ($1::uuid IS NULL OR a.subsidiary_id = $1)
		  AND pos.reports_to_position_id IS NOT NULL
		  AND per.user_id IS NOT NULL
		  AND parent_per.user_id IS NOT NULL
		  AND per.user_id != parent_per.user_id
	`
	rows, err := s.pool.Query(ctx, assignSQL, subsidiaryID)
	if err != nil {
		return AutoAssignResult{}, fmt.Errorf("appraisal: auto-assign: query org chart: %w", err)
	}
	defer rows.Close()

	type pair struct{ appraisee, reviewer uuid.UUID }
	var pairs []pair
	for rows.Next() {
		var p pair
		if err := rows.Scan(&p.appraisee, &p.reviewer); err != nil {
			return AutoAssignResult{}, fmt.Errorf("appraisal: auto-assign: scan: %w", err)
		}
		pairs = append(pairs, p)
	}
	if err := rows.Err(); err != nil {
		return AutoAssignResult{}, err
	}

	count := 0
	for _, p := range pairs {
		_, err := s.AssignReviewer(ctx, cycleID, p.appraisee, p.reviewer, assignedBy)
		if err != nil {
			return AutoAssignResult{Assigned: count}, fmt.Errorf("appraisal: auto-assign: upsert %s -> %s: %w", p.appraisee, p.reviewer, err)
		}
		count++
	}

	// 3. Find skipped users — top-of-hierarchy (no reports_to_position_id)
	//    or parent position with no current holder.
	const skippedSQL = `
		SELECT DISTINCT ON (per.user_id)
			per.user_id,
			COALESCE(u.display_name, '') AS user_name,
			COALESCE(pos.title, '')      AS position_title,
			CASE
				WHEN pos.reports_to_position_id IS NULL THEN 'top_of_hierarchy'
				ELSE 'no_holder'
			END AS reason
		FROM organization.assignment a
		JOIN organization.position pos ON pos.id  = a.position_id
		JOIN organization.person   per ON per.id  = a.person_id
		JOIN identity.users          u ON u.id    = per.user_id
		WHERE a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		  AND ($1::uuid IS NULL OR a.subsidiary_id = $1)
		  AND per.user_id IS NOT NULL
		  AND (
		      pos.reports_to_position_id IS NULL
		      OR NOT EXISTS (
		          SELECT 1
		          FROM organization.assignment pa
		          JOIN organization.person pp ON pp.id = pa.person_id
		          WHERE pa.position_id      = pos.reports_to_position_id
		            AND pa.effective_from  <= CURRENT_DATE
		            AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE)
		            AND pp.user_id IS NOT NULL
		      )
		  )
		ORDER BY per.user_id, u.display_name
	`
	skippedRows, err := s.pool.Query(ctx, skippedSQL, subsidiaryID)
	if err != nil {
		// Non-fatal — return the assigned count with no skipped list rather than fail.
		return AutoAssignResult{Assigned: count}, nil
	}
	defer skippedRows.Close()

	var skipped []SkippedUser
	for skippedRows.Next() {
		var su SkippedUser
		if err := skippedRows.Scan(&su.UserID, &su.UserName, &su.PositionTitle, &su.Reason); err != nil {
			continue
		}
		skipped = append(skipped, su)
	}
	return AutoAssignResult{Assigned: count, Skipped: skipped}, nil
}


// AutoAssignResult is returned by AutoAssignFromOrgChart.
type AutoAssignResult struct {
	Assigned int           `json:"assigned"`
	Skipped  []SkippedUser `json:"skipped"`
}

// SkippedUser is an employee who could not be auto-assigned because their
// position sits at the top of the reporting hierarchy (no parent position)
// or the parent position currently has no holder.
type SkippedUser struct {
	UserID        uuid.UUID `json:"user_id"`
	UserName      string    `json:"user_name"`
	PositionTitle string    `json:"position_title"`
	Reason        string    `json:"reason"` // top_of_hierarchy | no_holder
}

// -------------------------------------------------------------------------
// Submission methods
// -------------------------------------------------------------------------

// GetOrCreateSubmission returns the existing submission for an appraisee in a
// cycle, or inserts a new one in pending status.
func (s *Service) GetOrCreateSubmission(ctx context.Context, cycleID, appraiseeID uuid.UUID) (Submission, error) {
	const upsert = `
		INSERT INTO appraisal.submission (id, cycle_id, appraisee_id, status, updated_at)
		VALUES (gen_random_uuid(), $1, $2, 'pending', now())
		ON CONFLICT (cycle_id, appraisee_id) DO UPDATE SET updated_at = appraisal.submission.updated_at
		RETURNING id, cycle_id, appraisee_id,
		          status, self_score, manager_score,
		          self_submitted_at, manager_submitted_at, updated_at
	`
	var sub Submission
	err := s.pool.QueryRow(ctx, upsert, cycleID, appraiseeID).Scan(
		&sub.ID, &sub.CycleID, &sub.AppraiseeID,
		&sub.Status, &sub.SelfScore, &sub.ManagerScore,
		&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return Submission{}, fmt.Errorf("appraisal: get or create submission: %w", err)
	}
	// Populate reviewer from the assignment table.
	var rid uuid.UUID
	if e := s.pool.QueryRow(ctx,
		`SELECT reviewer_id FROM appraisal.reviewer_assignment WHERE cycle_id = $1 AND appraisee_id = $2`,
		cycleID, appraiseeID,
	).Scan(&rid); e == nil {
		sub.ReviewerID = &rid
	}
	return sub, nil
}

// GetMySubmission returns a SubmissionDetail for the caller in a cycle, or nil
// if no submission exists yet and the cycle is not open.
func (s *Service) GetMySubmission(ctx context.Context, cycleID, callerID uuid.UUID) (*SubmissionDetail, error) {
	sub, err := s.GetOrCreateSubmission(ctx, cycleID, callerID)
	if err != nil {
		return nil, err
	}

	questions, err := s.ListQuestions(ctx, cycleID)
	if err != nil {
		return nil, err
	}

	selfResponses, err := s.listResponses(ctx, sub.ID, "self")
	if err != nil {
		return nil, err
	}
	managerResponses, err := s.listResponses(ctx, sub.ID, "manager")
	if err != nil {
		return nil, err
	}

	detail := &SubmissionDetail{
		Submission:       sub,
		Questions:        questions,
		SelfResponses:    selfResponses,
		ManagerResponses: managerResponses,
	}
	return detail, nil
}

// listResponses is an internal helper that fetches responses for a submission
// filtered by scorer_type.
func (s *Service) listResponses(ctx context.Context, submissionID uuid.UUID, scorerType string) ([]Response, error) {
	const sql = `
		SELECT id, submission_id, question_id, scorer_id, scorer_type,
		       score, comment, scored_at
		FROM appraisal.response
		WHERE submission_id = $1 AND scorer_type = $2
		ORDER BY scored_at
	`
	rows, err := s.pool.Query(ctx, sql, submissionID, scorerType)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list responses: %w", err)
	}
	defer rows.Close()

	out := make([]Response, 0)
	for rows.Next() {
		var r Response
		if err := rows.Scan(
			&r.ID, &r.SubmissionID, &r.QuestionID, &r.ScorerID, &r.ScorerType,
			&r.Score, &r.Comment, &r.ScoredAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list responses scan: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// calculateWeightedScore computes the weighted-average score (0-100) from a set
// of (score, weight, max_score) triples.
// weighted_average = sum(score * weight / max_score) / sum(weight) * 100
func calculateWeightedScore(responses []ResponseInput, questions []Question) float64 {
	qMap := make(map[uuid.UUID]Question, len(questions))
	for _, q := range questions {
		qMap[q.ID] = q
	}
	var weightedSum, totalWeight float64
	for _, r := range responses {
		q, ok := qMap[r.QuestionID]
		if !ok || q.MaxScore == 0 || q.Weight == 0 {
			continue
		}
		weightedSum += r.Score * q.Weight / float64(q.MaxScore)
		totalWeight += q.Weight
	}
	if totalWeight == 0 {
		return 0
	}
	return weightedSum / totalWeight * 100.0
}

// UpsertSelfResponses persists self-assessment responses and updates the
// submission status to self_draft and recalculates self_score.
func (s *Service) UpsertSelfResponses(ctx context.Context, submissionID, scorerID uuid.UUID, responses []ResponseInput) error {
	for _, r := range responses {
		const sql = `
			INSERT INTO appraisal.response (
				id, submission_id, question_id, scorer_id, scorer_type, score, comment, scored_at
			) VALUES (
				gen_random_uuid(), $1, $2, $3, 'self', $4, $5, now()
			)
			ON CONFLICT (submission_id, question_id, scorer_type)
			DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, scored_at = now()
		`
		if _, err := s.pool.Exec(ctx, sql, submissionID, r.QuestionID, scorerID, r.Score, r.Comment); err != nil {
			return fmt.Errorf("appraisal: upsert self response for question %s: %w", r.QuestionID, err)
		}
	}

	// Recalculate self_score.
	questions, err := s.questionsByCycleFromSubmission(ctx, submissionID)
	if err != nil {
		return err
	}
	score := calculateWeightedScore(responses, questions)

	const update = `
		UPDATE appraisal.submission
		SET status = 'self_draft', self_score = $2, updated_at = now()
		WHERE id = $1
	`
	if _, err := s.pool.Exec(ctx, update, submissionID, score); err != nil {
		return fmt.Errorf("appraisal: upsert self responses: update submission: %w", err)
	}
	return nil
}

// SubmitSelf finalises the self-assessment: sets status=self_submitted, records
// self_submitted_at, and computes the final self_score. The cycle must be open.
func (s *Service) SubmitSelf(ctx context.Context, submissionID, appraiseeID uuid.UUID) (Submission, error) {
	// Verify cycle is open.
	var cycleStatus string
	err := s.pool.QueryRow(ctx, `
		SELECT c.status
		FROM appraisal.submission sub
		JOIN appraisal.cycle c ON c.id = sub.cycle_id
		WHERE sub.id = $1 AND sub.appraisee_id = $2
	`, submissionID, appraiseeID).Scan(&cycleStatus)
	if err != nil {
		return Submission{}, fmt.Errorf("appraisal: submit self: resolve cycle: %w", err)
	}
	if cycleStatus != "open" {
		return Submission{}, errors.New("appraisal: submit self: cycle is not open")
	}

	// Load all self responses for score calculation.
	selfResponses, err := s.listResponses(ctx, submissionID, "self")
	if err != nil {
		return Submission{}, err
	}
	questions, err := s.questionsByCycleFromSubmission(ctx, submissionID)
	if err != nil {
		return Submission{}, err
	}
	inputs := make([]ResponseInput, len(selfResponses))
	for i, r := range selfResponses {
		inputs[i] = ResponseInput{QuestionID: r.QuestionID, Score: r.Score}
	}
	score := calculateWeightedScore(inputs, questions)

	const sql = `
		UPDATE appraisal.submission
		SET status = 'self_submitted', self_submitted_at = now(),
		    self_score = $2, updated_at = now()
		WHERE id = $1 AND appraisee_id = $3
		RETURNING id, cycle_id, appraisee_id, reviewer_id,
		          status, self_score, manager_score,
		          self_submitted_at, manager_submitted_at, updated_at
	`
	var sub Submission
	err = s.pool.QueryRow(ctx, sql, submissionID, score, appraiseeID).Scan(
		&sub.ID, &sub.CycleID, &sub.AppraiseeID, &sub.ReviewerID,
		&sub.Status, &sub.SelfScore, &sub.ManagerScore,
		&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return Submission{}, fmt.Errorf("appraisal: submit self: %w", err)
	}
	return sub, nil
}

// GetPendingReviews returns all submissions where the caller is the assigned
// reviewer, the status is self_submitted, and the cycle is open.
func (s *Service) GetPendingReviews(ctx context.Context, reviewerID uuid.UUID) ([]Submission, error) {
	const sql = `
		SELECT
			sub.id, sub.cycle_id,
			COALESCE(c.title, '')         AS cycle_title,
			sub.appraisee_id,
			COALESCE(ua.email, '')        AS appraisee_email,
			COALESCE(ua.display_name, '') AS appraisee_name,
			ra.reviewer_id,
			COALESCE(ur.display_name, '') AS reviewer_name,
			sub.status,
			sub.self_score, sub.manager_score,
			sub.self_submitted_at, sub.manager_submitted_at,
			sub.updated_at
		FROM appraisal.submission sub
		JOIN appraisal.cycle    c  ON c.id  = sub.cycle_id
		JOIN identity.users     ua ON ua.id = sub.appraisee_id
		JOIN appraisal.reviewer_assignment ra ON ra.cycle_id = sub.cycle_id AND ra.appraisee_id = sub.appraisee_id
		JOIN identity.users     ur ON ur.id = ra.reviewer_id
		WHERE ra.reviewer_id  = $1
		  AND sub.status IN ('self_submitted', 'manager_scoring')
		  AND c.status        = 'open'
		ORDER BY sub.updated_at DESC
	`
	rows, err := s.pool.Query(ctx, sql, reviewerID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: get pending reviews: %w", err)
	}
	defer rows.Close()

	out := make([]Submission, 0)
	for rows.Next() {
		var sub Submission
		if err := rows.Scan(
			&sub.ID, &sub.CycleID, &sub.CycleTitle,
			&sub.AppraiseeID, &sub.AppraiseeEmail, &sub.AppraiseeName,
			&sub.ReviewerID, &sub.ReviewerName,
			&sub.Status, &sub.SelfScore, &sub.ManagerScore,
			&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: get pending reviews scan: %w", err)
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// UpsertManagerResponses persists manager scoring responses and transitions
// the submission to manager_scoring status.
func (s *Service) UpsertManagerResponses(ctx context.Context, submissionID, reviewerID uuid.UUID, responses []ResponseInput) error {
	// Verify caller is the assigned reviewer via the reviewer_assignment table.
	var assignedReviewer uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT ra.reviewer_id FROM appraisal.reviewer_assignment ra
		 JOIN appraisal.submission sub ON sub.cycle_id = ra.cycle_id AND sub.appraisee_id = ra.appraisee_id
		 WHERE sub.id = $1`,
		submissionID,
	).Scan(&assignedReviewer)
	if err != nil {
		return fmt.Errorf("appraisal: upsert manager responses: resolve reviewer: %w", err)
	}
	if assignedReviewer != reviewerID {
		return errors.New("appraisal: upsert manager responses: caller is not the assigned reviewer")
	}

	for _, r := range responses {
		const sql = `
			INSERT INTO appraisal.response (
				id, submission_id, question_id, scorer_id, scorer_type, score, comment, scored_at
			) VALUES (
				gen_random_uuid(), $1, $2, $3, 'manager', $4, $5, now()
			)
			ON CONFLICT (submission_id, question_id, scorer_type)
			DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, scored_at = now()
		`
		if _, err := s.pool.Exec(ctx, sql, submissionID, r.QuestionID, reviewerID, r.Score, r.Comment); err != nil {
			return fmt.Errorf("appraisal: upsert manager response for question %s: %w", r.QuestionID, err)
		}
	}

	// Recalculate manager score draft.
	questions, err := s.questionsByCycleFromSubmission(ctx, submissionID)
	if err != nil {
		return err
	}
	score := calculateWeightedScore(responses, questions)

	const update = `
		UPDATE appraisal.submission
		SET status = 'manager_scoring', manager_score = $2, updated_at = now()
		WHERE id = $1
	`
	if _, err := s.pool.Exec(ctx, update, submissionID, score); err != nil {
		return fmt.Errorf("appraisal: upsert manager responses: update submission: %w", err)
	}
	return nil
}

// SubmitManagerReview finalises the manager review: sets status=completed,
// manager_submitted_at=now(), and computes the final manager_score.
func (s *Service) SubmitManagerReview(ctx context.Context, submissionID, reviewerID uuid.UUID) (Submission, error) {
	// Verify caller is the assigned reviewer via the reviewer_assignment table.
	var assignedReviewer uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT ra.reviewer_id FROM appraisal.reviewer_assignment ra
		 JOIN appraisal.submission sub ON sub.cycle_id = ra.cycle_id AND sub.appraisee_id = ra.appraisee_id
		 WHERE sub.id = $1`,
		submissionID,
	).Scan(&assignedReviewer)
	if err != nil {
		return Submission{}, fmt.Errorf("appraisal: submit manager review: resolve reviewer: %w", err)
	}
	if assignedReviewer != reviewerID {
		return Submission{}, errors.New("appraisal: submit manager review: caller is not the assigned reviewer")
	}

	// Load manager responses to compute final score.
	managerResponses, err := s.listResponses(ctx, submissionID, "manager")
	if err != nil {
		return Submission{}, err
	}
	questions, err := s.questionsByCycleFromSubmission(ctx, submissionID)
	if err != nil {
		return Submission{}, err
	}
	inputs := make([]ResponseInput, len(managerResponses))
	for i, r := range managerResponses {
		inputs[i] = ResponseInput{QuestionID: r.QuestionID, Score: r.Score}
	}
	score := calculateWeightedScore(inputs, questions)

	const sql = `
		UPDATE appraisal.submission
		SET status = 'completed', manager_submitted_at = now(),
		    manager_score = $2, updated_at = now()
		WHERE id = $1 AND reviewer_id = $3
		RETURNING id, cycle_id, appraisee_id, reviewer_id,
		          status, self_score, manager_score,
		          self_submitted_at, manager_submitted_at, updated_at
	`
	var sub Submission
	err = s.pool.QueryRow(ctx, sql, submissionID, score, reviewerID).Scan(
		&sub.ID, &sub.CycleID, &sub.AppraiseeID, &sub.ReviewerID,
		&sub.Status, &sub.SelfScore, &sub.ManagerScore,
		&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return Submission{}, fmt.Errorf("appraisal: submit manager review: %w", err)
	}
	return sub, nil
}

// ListCycleSubmissions returns all submissions for a cycle with enriched names.
func (s *Service) ListCycleSubmissions(ctx context.Context, cycleID uuid.UUID) ([]Submission, error) {
	const sql = `
		SELECT
			sub.id, sub.cycle_id,
			COALESCE(c.title, '')         AS cycle_title,
			sub.appraisee_id,
			COALESCE(ua.email, '')        AS appraisee_email,
			COALESCE(ua.display_name, '') AS appraisee_name,
			ra.reviewer_id,
			COALESCE(ur.display_name, '') AS reviewer_name,
			sub.status,
			sub.self_score, sub.manager_score,
			sub.self_submitted_at, sub.manager_submitted_at,
			sub.updated_at
		FROM appraisal.submission sub
		JOIN appraisal.cycle   c  ON c.id  = sub.cycle_id
		JOIN identity.users    ua ON ua.id = sub.appraisee_id
		LEFT JOIN appraisal.reviewer_assignment ra ON ra.cycle_id = sub.cycle_id AND ra.appraisee_id = sub.appraisee_id
		LEFT JOIN identity.users ur ON ur.id = ra.reviewer_id
		WHERE sub.cycle_id = $1
		ORDER BY ua.display_name
	`
	rows, err := s.pool.Query(ctx, sql, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list cycle submissions: %w", err)
	}
	defer rows.Close()

	out := make([]Submission, 0)
	for rows.Next() {
		var sub Submission
		if err := rows.Scan(
			&sub.ID, &sub.CycleID, &sub.CycleTitle,
			&sub.AppraiseeID, &sub.AppraiseeEmail, &sub.AppraiseeName,
			&sub.ReviewerID, &sub.ReviewerName,
			&sub.Status, &sub.SelfScore, &sub.ManagerScore,
			&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list cycle submissions scan: %w", err)
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// GetSubmissionDetail returns full detail for a submission including questions
// and all responses keyed by scorer_type.
func (s *Service) GetSubmissionDetail(ctx context.Context, id uuid.UUID) (*SubmissionDetail, error) {
	const sql = `
		SELECT
			sub.id, sub.cycle_id,
			COALESCE(c.title, '')         AS cycle_title,
			sub.appraisee_id,
			COALESCE(ua.email, '')        AS appraisee_email,
			COALESCE(ua.display_name, '') AS appraisee_name,
			ra.reviewer_id,
			COALESCE(ur.display_name, '') AS reviewer_name,
			sub.status,
			sub.self_score, sub.manager_score,
			sub.self_submitted_at, sub.manager_submitted_at,
			sub.updated_at
		FROM appraisal.submission sub
		JOIN appraisal.cycle   c  ON c.id  = sub.cycle_id
		JOIN identity.users    ua ON ua.id = sub.appraisee_id
		LEFT JOIN appraisal.reviewer_assignment ra ON ra.cycle_id = sub.cycle_id AND ra.appraisee_id = sub.appraisee_id
		LEFT JOIN identity.users ur ON ur.id = ra.reviewer_id
		WHERE sub.id = $1
	`
	var sub Submission
	err := s.pool.QueryRow(ctx, sql, id).Scan(
		&sub.ID, &sub.CycleID, &sub.CycleTitle,
		&sub.AppraiseeID, &sub.AppraiseeEmail, &sub.AppraiseeName,
		&sub.ReviewerID, &sub.ReviewerName,
		&sub.Status, &sub.SelfScore, &sub.ManagerScore,
		&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("appraisal: get submission detail: %w", err)
	}

	questions, err := s.ListQuestions(ctx, sub.CycleID)
	if err != nil {
		return nil, err
	}
	selfResponses, err := s.listResponses(ctx, sub.ID, "self")
	if err != nil {
		return nil, err
	}
	managerResponses, err := s.listResponses(ctx, sub.ID, "manager")
	if err != nil {
		return nil, err
	}

	return &SubmissionDetail{
		Submission:       sub,
		Questions:        questions,
		SelfResponses:    selfResponses,
		ManagerResponses: managerResponses,
	}, nil
}

// -------------------------------------------------------------------------
// Role helpers
// -------------------------------------------------------------------------

// HasHROrAdminRole returns true if the user holds any HR or admin position in
// either the identity or organisation tables.
func (s *Service) HasHROrAdminRole(ctx context.Context, userID uuid.UUID) (bool, error) {
	// Check identity.users role column first (quick path).
	var roleStr string
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(role, '') FROM identity.users WHERE id = $1`,
		userID,
	).Scan(&roleStr)
	role := strings.ToLower(roleStr)
	if strings.Contains(role, "hr") || strings.Contains(role, "admin") {
		return true, nil
	}

	// Fallback: check org position codes that imply HR / admin access.
	const sql = `
		SELECT EXISTS (
			SELECT 1
			FROM organization.assignment a
			JOIN organization.position pos ON pos.id = a.position_id
			JOIN organization.person   per ON per.id = a.person_id
			WHERE per.user_id = $1
			  AND (
			      LOWER(pos.code)  LIKE '%hr%'
			      OR LOWER(pos.code)  LIKE '%admin%'
			      OR LOWER(pos.title) LIKE '%human resource%'
			      OR LOWER(pos.title) LIKE '%administrator%'
			  )
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var exists bool
	if err := s.pool.QueryRow(ctx, sql, userID).Scan(&exists); err != nil {
		return false, fmt.Errorf("appraisal: has hr or admin role: %w", err)
	}
	return exists, nil
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

// ListMySubmissions returns all submissions for the given user across all cycles,
// ordered by the cycle's created_at descending. Includes cycle title for display.
func (s *Service) ListMySubmissions(ctx context.Context, userID uuid.UUID) ([]Submission, error) {
	const q = `
		SELECT
			sub.id, sub.cycle_id,
			COALESCE(c.title, '')         AS cycle_title,
			sub.appraisee_id,
			COALESCE(u.email, '')         AS appraisee_email,
			COALESCE(u.display_name, '')  AS appraisee_name,
			ra.reviewer_id,
			COALESCE(ru.display_name, '') AS reviewer_name,
			sub.status, sub.self_score, sub.manager_score,
			sub.self_submitted_at, sub.manager_submitted_at, sub.updated_at
		FROM appraisal.submission sub
		JOIN appraisal.cycle c ON c.id = sub.cycle_id
		JOIN identity.users u ON u.id = sub.appraisee_id
		LEFT JOIN appraisal.reviewer_assignment ra ON ra.cycle_id = sub.cycle_id AND ra.appraisee_id = sub.appraisee_id
		LEFT JOIN identity.users ru ON ru.id = ra.reviewer_id
		WHERE sub.appraisee_id = $1
		ORDER BY c.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list my submissions: %w", err)
	}
	defer rows.Close()
	out := make([]Submission, 0)
	for rows.Next() {
		var sub Submission
		if err := rows.Scan(
			&sub.ID, &sub.CycleID, &sub.CycleTitle,
			&sub.AppraiseeID, &sub.AppraiseeEmail, &sub.AppraiseeName,
			&sub.ReviewerID, &sub.ReviewerName,
			&sub.Status, &sub.SelfScore, &sub.ManagerScore,
			&sub.SelfSubmittedAt, &sub.ManagerSubmittedAt, &sub.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("appraisal: list my submissions scan: %w", err)
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// questionsByCycleFromSubmission resolves the cycle from a submission ID and
// returns its questions — used internally for score recalculation.
func (s *Service) questionsByCycleFromSubmission(ctx context.Context, submissionID uuid.UUID) ([]Question, error) {
	var cycleID uuid.UUID
	if err := s.pool.QueryRow(ctx,
		`SELECT cycle_id FROM appraisal.submission WHERE id = $1`,
		submissionID,
	).Scan(&cycleID); err != nil {
		return nil, fmt.Errorf("appraisal: resolve cycle from submission: %w", err)
	}
	return s.ListQuestions(ctx, cycleID)
}

// Ensure fmt, errors, strings are used (they are, but this guards against
// accidental removal during refactors).
var _ = fmt.Sprintf
var _ = errors.New
var _ = strings.ToLower
