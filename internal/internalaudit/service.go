// Package internalaudit manages the Internal Audit compliance review workflow:
// review items, checklists, exceptions, documents, and actions.
package internalaudit

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Domain types ──────────────────────────────────────────────────────────────

// ReviewItem is a compliance / audit review task.
type ReviewItem struct {
	ID                   string     `json:"id"`
	ReferenceNo          string     `json:"reference_no"`
	Title                string     `json:"title"`
	ItemType             string     `json:"item_type"`
	BusinessUnit         string     `json:"business_unit"`
	RiskLevel            string     `json:"risk_level"`
	Status               string     `json:"status"`
	Priority             string     `json:"priority"`
	SubmitterID          string     `json:"submitter_id"`
	SubmitterName        string     `json:"submitter_name"`
	AssignedReviewerID   string     `json:"assigned_reviewer_id"`
	AssignedReviewerName string     `json:"assigned_reviewer_name"`
	SubmissionDate       time.Time  `json:"submission_date"`
	DueDate              *time.Time `json:"due_date,omitempty"`
	ReviewStartedAt      *time.Time `json:"review_started_at,omitempty"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
	ComplianceRequired   bool       `json:"compliance_required"`
	ComplianceCleared    *bool      `json:"compliance_cleared,omitempty"`
	Description          string     `json:"description"`
	Instructions         string     `json:"instructions"`
	LinkedClientRef      string     `json:"linked_client_ref"`
	LinkedTransactionRef string     `json:"linked_transaction_ref"`
	AgeInDays            int        `json:"age_in_days"`
	IsOverdue            bool       `json:"is_overdue"`
	ExceptionCount       int        `json:"exception_count"`
	DocumentCount        int        `json:"document_count"`
	ChecklistTotal       int        `json:"checklist_total"`
	ChecklistDone        int        `json:"checklist_done"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// ReviewAction records a state transition on a ReviewItem.
type ReviewAction struct {
	ID             string    `json:"id"`
	ReviewItemID   string    `json:"review_item_id"`
	Action         string    `json:"action"`
	ActorName      string    `json:"actor_name"`
	Comments       string    `json:"comments"`
	PreviousStatus string    `json:"previous_status"`
	NewStatus      string    `json:"new_status"`
	CreatedAt      time.Time `json:"created_at"`
}

// ReviewDocument is a file attached to a ReviewItem.
type ReviewDocument struct {
	ID           string    `json:"id"`
	ReviewItemID string    `json:"review_item_id"`
	FileName     string    `json:"file_name"`
	DocumentType string    `json:"document_type"`
	UploaderName string    `json:"uploader_name"`
	FileSize     int64     `json:"file_size"`
	ContentType  string    `json:"content_type"`
	Notes        string    `json:"notes"`
	CreatedAt    time.Time `json:"created_at"`
}

// ChecklistItem is one task in the review checklist.
type ChecklistItem struct {
	ID               string     `json:"id"`
	ReviewItemID     string     `json:"review_item_id"`
	Seq              int        `json:"seq"`
	Label            string     `json:"label"`
	Status           string     `json:"status"`
	ReviewerComments string     `json:"reviewer_comments"`
	ValidatedByName  string     `json:"validated_by_name"`
	ValidatedAt      *time.Time `json:"validated_at,omitempty"`
	IsMandatory      bool       `json:"is_mandatory"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// ReviewException is a compliance finding raised during a review.
type ReviewException struct {
	ID               string     `json:"id"`
	ReviewItemID     string     `json:"review_item_id"`
	Title            string     `json:"title"`
	Description      string     `json:"description"`
	Severity         string     `json:"severity"`
	Status           string     `json:"status"`
	OwnerName        string     `json:"owner_name"`
	CorrectiveAction string     `json:"corrective_action"`
	DueDate          *time.Time `json:"due_date,omitempty"`
	ResolvedAt       *time.Time `json:"resolved_at,omitempty"`
	RaisedByName     string     `json:"raised_by_name"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// DashboardStats are summary counts for the audit dashboard.
type DashboardStats struct {
	DueTodayCount        int `json:"due_today_count"`
	OverdueCount         int `json:"overdue_count"`
	PendingReviewCount   int `json:"pending_review_count"`
	UnderReviewCount     int `json:"under_review_count"`
	OpenExceptionCount   int `json:"open_exception_count"`
	ExceptionRaisedCount int `json:"exception_raised_count"`
	CompletedTodayCount  int `json:"completed_today_count"`
}

// ── Service ───────────────────────────────────────────────────────────────────

// Service provides the internal-audit business logic backed by PostgreSQL.
type Service struct {
	pool *pgxpool.Pool
}

// NewService returns a new Service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ── Review Items ──────────────────────────────────────────────────────────────

// ListReviewItems returns review items with optional filters.
func (s *Service) ListReviewItems(ctx context.Context, statusFilter, businessUnitFilter, riskFilter, search string) ([]ReviewItem, error) {
	query := `
		SELECT
			ri.id::text,
			ri.reference_no,
			ri.title,
			ri.item_type,
			ri.business_unit,
			ri.risk_level,
			ri.status,
			ri.priority,
			COALESCE(ri.submitter_id::text, ''),
			COALESCE(ri.submitter_name, ''),
			COALESCE(ri.assigned_reviewer_id::text, ''),
			COALESCE(ri.assigned_reviewer_name, ''),
			ri.submission_date,
			ri.due_date,
			ri.review_started_at,
			ri.completed_at,
			ri.compliance_required,
			ri.compliance_cleared,
			COALESCE(ri.description, ''),
			COALESCE(ri.instructions, ''),
			COALESCE(ri.linked_client_ref, ''),
			COALESCE(ri.linked_transaction_ref, ''),
			EXTRACT(DAY FROM now() - ri.submission_date)::int,
			(ri.due_date IS NOT NULL AND ri.due_date < now() AND ri.status NOT IN ('completed','rejected')),
			COALESCE(exc.cnt, 0),
			COALESCE(doc.cnt, 0),
			COALESCE(chk.total, 0),
			COALESCE(chk.done, 0),
			ri.created_at,
			ri.updated_at
		FROM internal_audit.review_item ri
		LEFT JOIN (
			SELECT review_item_id, COUNT(*) AS cnt
			FROM internal_audit.review_exception
			GROUP BY review_item_id
		) exc ON exc.review_item_id = ri.id
		LEFT JOIN (
			SELECT review_item_id, COUNT(*) AS cnt
			FROM internal_audit.review_document
			GROUP BY review_item_id
		) doc ON doc.review_item_id = ri.id
		LEFT JOIN (
			SELECT review_item_id,
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE status = 'done') AS done
			FROM internal_audit.checklist_item
			GROUP BY review_item_id
		) chk ON chk.review_item_id = ri.id
		WHERE 1=1
	`
	args := []interface{}{}
	argN := 1

	if statusFilter != "" {
		query += fmt.Sprintf(" AND ri.status = $%d", argN)
		args = append(args, statusFilter)
		argN++
	}
	if businessUnitFilter != "" {
		query += fmt.Sprintf(" AND ri.business_unit = $%d", argN)
		args = append(args, businessUnitFilter)
		argN++
	}
	if riskFilter != "" {
		query += fmt.Sprintf(" AND ri.risk_level = $%d", argN)
		args = append(args, riskFilter)
		argN++
	}
	if search != "" {
		query += fmt.Sprintf(" AND (ri.title ILIKE $%d OR ri.reference_no ILIKE $%d OR ri.submitter_name ILIKE $%d)", argN, argN, argN)
		args = append(args, "%"+search+"%")
		argN++
	}

	query += " ORDER BY ri.created_at DESC"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: list review items: %w", err)
	}
	defer rows.Close()

	var items []ReviewItem
	for rows.Next() {
		var it ReviewItem
		if err := rows.Scan(
			&it.ID, &it.ReferenceNo, &it.Title, &it.ItemType, &it.BusinessUnit,
			&it.RiskLevel, &it.Status, &it.Priority,
			&it.SubmitterID, &it.SubmitterName,
			&it.AssignedReviewerID, &it.AssignedReviewerName,
			&it.SubmissionDate, &it.DueDate, &it.ReviewStartedAt, &it.CompletedAt,
			&it.ComplianceRequired, &it.ComplianceCleared,
			&it.Description, &it.Instructions,
			&it.LinkedClientRef, &it.LinkedTransactionRef,
			&it.AgeInDays, &it.IsOverdue,
			&it.ExceptionCount, &it.DocumentCount,
			&it.ChecklistTotal, &it.ChecklistDone,
			&it.CreatedAt, &it.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("internalaudit: scan review item: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("internalaudit: rows error: %w", err)
	}
	return items, nil
}

// GetReviewItem returns one review item by ID.
func (s *Service) GetReviewItem(ctx context.Context, id string) (*ReviewItem, error) {
	query := `
		SELECT
			ri.id::text,
			ri.reference_no,
			ri.title,
			ri.item_type,
			ri.business_unit,
			ri.risk_level,
			ri.status,
			ri.priority,
			COALESCE(ri.submitter_id::text, ''),
			COALESCE(ri.submitter_name, ''),
			COALESCE(ri.assigned_reviewer_id::text, ''),
			COALESCE(ri.assigned_reviewer_name, ''),
			ri.submission_date,
			ri.due_date,
			ri.review_started_at,
			ri.completed_at,
			ri.compliance_required,
			ri.compliance_cleared,
			COALESCE(ri.description, ''),
			COALESCE(ri.instructions, ''),
			COALESCE(ri.linked_client_ref, ''),
			COALESCE(ri.linked_transaction_ref, ''),
			EXTRACT(DAY FROM now() - ri.submission_date)::int,
			(ri.due_date IS NOT NULL AND ri.due_date < now() AND ri.status NOT IN ('completed','rejected')),
			COALESCE(exc.cnt, 0),
			COALESCE(doc.cnt, 0),
			COALESCE(chk.total, 0),
			COALESCE(chk.done, 0),
			ri.created_at,
			ri.updated_at
		FROM internal_audit.review_item ri
		LEFT JOIN (
			SELECT review_item_id, COUNT(*) AS cnt
			FROM internal_audit.review_exception
			GROUP BY review_item_id
		) exc ON exc.review_item_id = ri.id
		LEFT JOIN (
			SELECT review_item_id, COUNT(*) AS cnt
			FROM internal_audit.review_document
			GROUP BY review_item_id
		) doc ON doc.review_item_id = ri.id
		LEFT JOIN (
			SELECT review_item_id,
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE status = 'done') AS done
			FROM internal_audit.checklist_item
			GROUP BY review_item_id
		) chk ON chk.review_item_id = ri.id
		WHERE ri.id = $1
	`
	var it ReviewItem
	err := s.pool.QueryRow(ctx, query, id).Scan(
		&it.ID, &it.ReferenceNo, &it.Title, &it.ItemType, &it.BusinessUnit,
		&it.RiskLevel, &it.Status, &it.Priority,
		&it.SubmitterID, &it.SubmitterName,
		&it.AssignedReviewerID, &it.AssignedReviewerName,
		&it.SubmissionDate, &it.DueDate, &it.ReviewStartedAt, &it.CompletedAt,
		&it.ComplianceRequired, &it.ComplianceCleared,
		&it.Description, &it.Instructions,
		&it.LinkedClientRef, &it.LinkedTransactionRef,
		&it.AgeInDays, &it.IsOverdue,
		&it.ExceptionCount, &it.DocumentCount,
		&it.ChecklistTotal, &it.ChecklistDone,
		&it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("internalaudit: review item not found")
		}
		return nil, fmt.Errorf("internalaudit: get review item: %w", err)
	}
	return &it, nil
}

// CreateReviewItem creates a new review item and returns it.
func (s *Service) CreateReviewItem(
	ctx context.Context,
	title, itemType, businessUnit, riskLevel, priority string,
	dueDate *time.Time,
	description, instructions string,
	complianceRequired bool,
	linkedClientRef, linkedTransactionRef string,
	submitterID *uuid.UUID,
	submitterName string,
) (*ReviewItem, error) {
	// Generate sequential reference number within the current year.
	year := time.Now().Year()
	var seq int
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(CAST(SPLIT_PART(reference_no, '-', 3) AS INT)), 0) + 1
		 FROM internal_audit.review_item
		 WHERE reference_no LIKE 'CRQ-' || $1::text || '-%'`,
		year,
	).Scan(&seq)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: generate ref no: %w", err)
	}
	refNo := fmt.Sprintf("CRQ-%d-%04d", year, seq)

	id := uuid.New()
	now := time.Now()

	_, err = s.pool.Exec(ctx,
		`INSERT INTO internal_audit.review_item
			(id, reference_no, title, item_type, business_unit, risk_level, status, priority,
			 submitter_id, submitter_name, submission_date, due_date, compliance_required,
			 description, instructions, linked_client_ref, linked_transaction_ref,
			 created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,'pending_review',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		id, refNo, title, itemType, businessUnit, riskLevel, priority,
		submitterID, submitterName, now, dueDate, complianceRequired,
		description, instructions, linkedClientRef, linkedTransactionRef,
		now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: create review item: %w", err)
	}

	return s.GetReviewItem(ctx, id.String())
}

// TakeAction applies a named action to a review item, updating its status and recording
// the action in the review_action table.
func (s *Service) TakeAction(ctx context.Context, id, action, comments string, actorID *uuid.UUID, actorName string) (*ReviewItem, error) {
	item, err := s.GetReviewItem(ctx, id)
	if err != nil {
		return nil, err
	}

	statusMap := map[string]string{
		"pass":                "completed",
		"return":              "awaiting_information",
		"escalate":            "escalated",
		"reject":              "completed",
		"request_information": "awaiting_information",
		"start_review":        "under_review",
		"resume":              "under_review",
	}
	newStatus, ok := statusMap[action]
	if !ok {
		return nil, fmt.Errorf("internalaudit: unknown action %q", action)
	}

	prevStatus := item.Status
	now := time.Now()

	// Build extra update clauses based on action.
	var updateSQL string
	switch action {
	case "start_review":
		updateSQL = ", review_started_at = $3"
	case "pass", "reject":
		updateSQL = ", completed_at = $3"
	default:
		updateSQL = ""
	}

	var execErr error
	if updateSQL != "" {
		_, execErr = s.pool.Exec(ctx,
			`UPDATE internal_audit.review_item SET status = $1, updated_at = $2`+updateSQL+` WHERE id = $4`,
			newStatus, now, now, id,
		)
	} else {
		_, execErr = s.pool.Exec(ctx,
			`UPDATE internal_audit.review_item SET status = $1, updated_at = $2 WHERE id = $3`,
			newStatus, now, id,
		)
	}
	if execErr != nil {
		return nil, fmt.Errorf("internalaudit: take action update: %w", execErr)
	}

	// Record the action.
	_, err = s.pool.Exec(ctx,
		`INSERT INTO internal_audit.review_action
			(id, review_item_id, action, actor_id, actor_name, comments, previous_status, new_status, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		uuid.New(), id, action, actorID, actorName, comments, prevStatus, newStatus, now,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: record action: %w", err)
	}

	return s.GetReviewItem(ctx, id)
}

// AssignReviewer sets the assigned reviewer on a review item.
func (s *Service) AssignReviewer(ctx context.Context, id, reviewerName string, actorID *uuid.UUID, actorName string) error {
	item, err := s.GetReviewItem(ctx, id)
	if err != nil {
		return err
	}
	prevStatus := item.Status
	now := time.Now()

	_, err = s.pool.Exec(ctx,
		`UPDATE internal_audit.review_item
		 SET assigned_reviewer_name = $1, updated_at = $2
		 WHERE id = $3`,
		reviewerName, now, id,
	)
	if err != nil {
		return fmt.Errorf("internalaudit: assign reviewer: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO internal_audit.review_action
			(id, review_item_id, action, actor_id, actor_name, comments, previous_status, new_status, created_at)
		 VALUES ($1,$2,'assign',$3,$4,$5,$6,$6,$7)`,
		uuid.New(), id, actorID, actorName,
		fmt.Sprintf("Assigned to %s", reviewerName), prevStatus, now,
	)
	if err != nil {
		return fmt.Errorf("internalaudit: record assign action: %w", err)
	}
	return nil
}

// ── Checklist ─────────────────────────────────────────────────────────────────

// GetChecklist returns all checklist items for a review item.
func (s *Service) GetChecklist(ctx context.Context, reviewItemID string) ([]ChecklistItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, review_item_id::text, seq, label, status,
			COALESCE(reviewer_comments, ''), COALESCE(validated_by_name, ''),
			validated_at, is_mandatory, updated_at
		 FROM internal_audit.checklist_item
		 WHERE review_item_id = $1
		 ORDER BY seq`,
		reviewItemID,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: get checklist: %w", err)
	}
	defer rows.Close()

	var items []ChecklistItem
	for rows.Next() {
		var ci ChecklistItem
		if err := rows.Scan(
			&ci.ID, &ci.ReviewItemID, &ci.Seq, &ci.Label, &ci.Status,
			&ci.ReviewerComments, &ci.ValidatedByName,
			&ci.ValidatedAt, &ci.IsMandatory, &ci.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("internalaudit: scan checklist item: %w", err)
		}
		items = append(items, ci)
	}
	return items, rows.Err()
}

// SeedChecklist populates a review item's checklist from a template if no items exist yet.
func (s *Service) SeedChecklist(ctx context.Context, reviewItemID, itemType string) error {
	// Only seed if the checklist is empty.
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM internal_audit.checklist_item WHERE review_item_id = $1`,
		reviewItemID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("internalaudit: check checklist: %w", err)
	}
	if count > 0 {
		return nil // already seeded
	}

	rows, err := s.pool.Query(ctx,
		`SELECT seq, label, is_mandatory
		 FROM internal_audit.checklist_template
		 WHERE item_type = $1
		 ORDER BY seq`,
		itemType,
	)
	if err != nil {
		return fmt.Errorf("internalaudit: load template: %w", err)
	}
	defer rows.Close()

	now := time.Now()
	for rows.Next() {
		var seq int
		var label string
		var isMandatory bool
		if err := rows.Scan(&seq, &label, &isMandatory); err != nil {
			return fmt.Errorf("internalaudit: scan template: %w", err)
		}
		_, err = s.pool.Exec(ctx,
			`INSERT INTO internal_audit.checklist_item
				(id, review_item_id, seq, label, status, is_mandatory, updated_at)
			 VALUES ($1,$2,$3,$4,'pending',$5,$6)`,
			uuid.New(), reviewItemID, seq, label, isMandatory, now,
		)
		if err != nil {
			return fmt.Errorf("internalaudit: seed checklist item: %w", err)
		}
	}
	return rows.Err()
}

// UpdateChecklistItem updates the status and comments on a checklist item.
func (s *Service) UpdateChecklistItem(ctx context.Context, checklistItemID, reviewItemID, status, comments string, validatorID *uuid.UUID, validatorName string) (*ChecklistItem, error) {
	now := time.Now()
	var validatedAt *time.Time
	if status == "done" {
		validatedAt = &now
	}

	_, err := s.pool.Exec(ctx,
		`UPDATE internal_audit.checklist_item
		 SET status = $1, reviewer_comments = $2, validated_by_name = $3,
		     validated_at = $4, updated_at = $5
		 WHERE id = $6 AND review_item_id = $7`,
		status, comments, validatorName, validatedAt, now, checklistItemID, reviewItemID,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: update checklist item: %w", err)
	}

	var ci ChecklistItem
	err = s.pool.QueryRow(ctx,
		`SELECT id::text, review_item_id::text, seq, label, status,
			COALESCE(reviewer_comments, ''), COALESCE(validated_by_name, ''),
			validated_at, is_mandatory, updated_at
		 FROM internal_audit.checklist_item
		 WHERE id = $1`,
		checklistItemID,
	).Scan(
		&ci.ID, &ci.ReviewItemID, &ci.Seq, &ci.Label, &ci.Status,
		&ci.ReviewerComments, &ci.ValidatedByName,
		&ci.ValidatedAt, &ci.IsMandatory, &ci.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: get updated checklist item: %w", err)
	}
	return &ci, nil
}

// ── Actions ───────────────────────────────────────────────────────────────────

// GetActions returns all recorded actions for a review item.
func (s *Service) GetActions(ctx context.Context, reviewItemID string) ([]ReviewAction, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, review_item_id::text, action, COALESCE(actor_name,''),
			COALESCE(comments,''), COALESCE(previous_status,''), COALESCE(new_status,''), created_at
		 FROM internal_audit.review_action
		 WHERE review_item_id = $1
		 ORDER BY created_at DESC`,
		reviewItemID,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: get actions: %w", err)
	}
	defer rows.Close()

	var actions []ReviewAction
	for rows.Next() {
		var a ReviewAction
		if err := rows.Scan(
			&a.ID, &a.ReviewItemID, &a.Action, &a.ActorName,
			&a.Comments, &a.PreviousStatus, &a.NewStatus, &a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("internalaudit: scan action: %w", err)
		}
		actions = append(actions, a)
	}
	return actions, rows.Err()
}

// ── Documents ─────────────────────────────────────────────────────────────────

// ListDocuments returns all documents attached to a review item.
func (s *Service) ListDocuments(ctx context.Context, reviewItemID string) ([]ReviewDocument, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, review_item_id::text, file_name, COALESCE(document_type,''),
			COALESCE(uploader_name,''), COALESCE(file_size,0), COALESCE(content_type,''),
			COALESCE(notes,''), created_at
		 FROM internal_audit.review_document
		 WHERE review_item_id = $1
		 ORDER BY created_at DESC`,
		reviewItemID,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: list documents: %w", err)
	}
	defer rows.Close()

	var docs []ReviewDocument
	for rows.Next() {
		var d ReviewDocument
		if err := rows.Scan(
			&d.ID, &d.ReviewItemID, &d.FileName, &d.DocumentType,
			&d.UploaderName, &d.FileSize, &d.ContentType, &d.Notes, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("internalaudit: scan document: %w", err)
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

// AddDocument inserts a new document record for a review item.
func (s *Service) AddDocument(ctx context.Context, reviewItemID, fileName, documentType, uploaderName string, fileSize int64, contentType, notes string, uploaderID *uuid.UUID) (*ReviewDocument, error) {
	id := uuid.New()
	now := time.Now()

	_, err := s.pool.Exec(ctx,
		`INSERT INTO internal_audit.review_document
			(id, review_item_id, file_name, document_type, uploader_id, uploader_name,
			 file_size, content_type, notes, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, reviewItemID, fileName, documentType, uploaderID, uploaderName,
		fileSize, contentType, notes, now,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: add document: %w", err)
	}

	var d ReviewDocument
	err = s.pool.QueryRow(ctx,
		`SELECT id::text, review_item_id::text, file_name, COALESCE(document_type,''),
			COALESCE(uploader_name,''), COALESCE(file_size,0), COALESCE(content_type,''),
			COALESCE(notes,''), created_at
		 FROM internal_audit.review_document WHERE id = $1`,
		id,
	).Scan(
		&d.ID, &d.ReviewItemID, &d.FileName, &d.DocumentType,
		&d.UploaderName, &d.FileSize, &d.ContentType, &d.Notes, &d.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: get created document: %w", err)
	}
	return &d, nil
}

// ── Exceptions ────────────────────────────────────────────────────────────────

// ListExceptions returns all exceptions for a review item.
func (s *Service) ListExceptions(ctx context.Context, reviewItemID string) ([]ReviewException, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, review_item_id::text, title, COALESCE(description,''),
			severity, status, COALESCE(owner_name,''), COALESCE(corrective_action,''),
			due_date, resolved_at, COALESCE(raised_by_name,''), created_at, updated_at
		 FROM internal_audit.review_exception
		 WHERE review_item_id = $1
		 ORDER BY created_at DESC`,
		reviewItemID,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: list exceptions: %w", err)
	}
	defer rows.Close()

	var excs []ReviewException
	for rows.Next() {
		var e ReviewException
		if err := rows.Scan(
			&e.ID, &e.ReviewItemID, &e.Title, &e.Description,
			&e.Severity, &e.Status, &e.OwnerName, &e.CorrectiveAction,
			&e.DueDate, &e.ResolvedAt, &e.RaisedByName, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("internalaudit: scan exception: %w", err)
		}
		excs = append(excs, e)
	}
	return excs, rows.Err()
}

// CreateException raises a new exception on a review item. If the review item is
// currently under_review its status is moved to exception_raised.
func (s *Service) CreateException(
	ctx context.Context,
	reviewItemID, title, description, severity, ownerName, correctiveAction string,
	dueDate *time.Time,
	raisedByID *uuid.UUID,
	raisedByName string,
) (*ReviewException, error) {
	id := uuid.New()
	now := time.Now()

	_, err := s.pool.Exec(ctx,
		`INSERT INTO internal_audit.review_exception
			(id, review_item_id, title, description, severity, status, owner_name,
			 corrective_action, due_date, raised_by_id, raised_by_name, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,$11,$12)`,
		id, reviewItemID, title, description, severity, ownerName,
		correctiveAction, dueDate, raisedByID, raisedByName, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: create exception: %w", err)
	}

	// Promote status if currently under_review.
	_, _ = s.pool.Exec(ctx,
		`UPDATE internal_audit.review_item
		 SET status = 'exception_raised', updated_at = $1
		 WHERE id = $2 AND status = 'under_review'`,
		now, reviewItemID,
	)

	var e ReviewException
	err = s.pool.QueryRow(ctx,
		`SELECT id::text, review_item_id::text, title, COALESCE(description,''),
			severity, status, COALESCE(owner_name,''), COALESCE(corrective_action,''),
			due_date, resolved_at, COALESCE(raised_by_name,''), created_at, updated_at
		 FROM internal_audit.review_exception WHERE id = $1`,
		id,
	).Scan(
		&e.ID, &e.ReviewItemID, &e.Title, &e.Description,
		&e.Severity, &e.Status, &e.OwnerName, &e.CorrectiveAction,
		&e.DueDate, &e.ResolvedAt, &e.RaisedByName, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: get created exception: %w", err)
	}
	return &e, nil
}

// UpdateException updates the status and corrective action of an exception.
func (s *Service) UpdateException(ctx context.Context, exceptionID, status, correctiveAction string) error {
	now := time.Now()
	var resolvedAt *time.Time
	if status == "resolved" {
		resolvedAt = &now
	}

	_, err := s.pool.Exec(ctx,
		`UPDATE internal_audit.review_exception
		 SET status = $1, corrective_action = $2, resolved_at = $3, updated_at = $4
		 WHERE id = $5`,
		status, correctiveAction, resolvedAt, now, exceptionID,
	)
	if err != nil {
		return fmt.Errorf("internalaudit: update exception: %w", err)
	}
	return nil
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

// GetDashboardStats returns aggregate counts for the audit dashboard.
func (s *Service) GetDashboardStats(ctx context.Context) (*DashboardStats, error) {
	var stats DashboardStats

	err := s.pool.QueryRow(ctx,
		`SELECT
			COUNT(*) FILTER (WHERE due_date::date = CURRENT_DATE AND status NOT IN ('completed','rejected')),
			COUNT(*) FILTER (WHERE due_date < now() AND status NOT IN ('completed','rejected')),
			COUNT(*) FILTER (WHERE status = 'pending_review'),
			COUNT(*) FILTER (WHERE status = 'under_review'),
			COUNT(*) FILTER (WHERE status = 'exception_raised'),
			COUNT(*) FILTER (WHERE completed_at::date = CURRENT_DATE)
		 FROM internal_audit.review_item`,
	).Scan(
		&stats.DueTodayCount,
		&stats.OverdueCount,
		&stats.PendingReviewCount,
		&stats.UnderReviewCount,
		&stats.ExceptionRaisedCount,
		&stats.CompletedTodayCount,
	)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: dashboard stats (items): %w", err)
	}

	err = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM internal_audit.review_exception WHERE status = 'open'`,
	).Scan(&stats.OpenExceptionCount)
	if err != nil {
		return nil, fmt.Errorf("internalaudit: dashboard stats (exceptions): %w", err)
	}

	return &stats, nil
}
