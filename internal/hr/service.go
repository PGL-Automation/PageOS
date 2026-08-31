// Package hr manages employee leave policies, balances, and requests.
package hr

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/notification"
)

// Service holds the HR business logic and runs raw SQL queries directly.
type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ── Domain types ──────────────────────────────────────────────────────────────

type LeavePolicy struct {
	ID                   uuid.UUID `json:"id"`
	Code                 string    `json:"code"`
	Name                 string    `json:"name"`
	DaysPerYear          int       `json:"days_per_year"`
	RequiresApproval     bool      `json:"requires_approval"`
	IsActive             bool      `json:"is_active"`
	IsUnpaid             bool      `json:"is_unpaid"`
	MinimumTenureMonths  int       `json:"minimum_tenure_months"`
	ApplicableGrades     []string  `json:"applicable_grades,omitempty"`
}

type LeaveRequest struct {
	ID                 uuid.UUID  `json:"id"`
	PersonID           uuid.UUID  `json:"person_id"`
	PersonName         string     `json:"person_name"`
	PersonEmail        string     `json:"person_email"`
	SubsidiaryName     string     `json:"subsidiary_name"`
	PolicyID           uuid.UUID  `json:"policy_id"`
	PolicyCode         string     `json:"policy_code"`
	PolicyName         string     `json:"policy_name"`
	StartDate          string     `json:"start_date"`
	EndDate            string     `json:"end_date"`
	DaysCount          float64    `json:"days_count"`
	Status             string     `json:"status"`
	Notes              string     `json:"notes"`
	ReviewerPersonID   *uuid.UUID `json:"reviewer_person_id,omitempty"`
	ReviewerNote       string     `json:"reviewer_note"`
	ReviewedAt         *time.Time `json:"reviewed_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	RelieverPersonID   *uuid.UUID `json:"reliever_person_id,omitempty"`
	RelieverName       string     `json:"reliever_name,omitempty"`
	HandoverDocumentID *uuid.UUID `json:"handover_document_id,omitempty"`
}

type LeaveBalance struct {
	PolicyID      uuid.UUID `json:"policy_id"`
	PolicyCode    string    `json:"policy_code"`
	PolicyName    string    `json:"policy_name"`
	Year          int       `json:"year"`
	DaysGranted   float64   `json:"days_granted"`
	DaysUsed      float64   `json:"days_used"`
	DaysRemaining float64   `json:"days_remaining"`
}

// ── Policies ──────────────────────────────────────────────────────────────────

// ListPolicies returns active leave policies filtered to what the caller is
// actually eligible for. When personID is nil (HR view) all policies are returned.
//
// Eligibility rules:
//  1. Grade-tiered annual leave — only the tier matching the person's grade.
//  2. Gender-restricted leave (Maternity/Paternity) — must match person.gender.
//  3. Tenure-gated leave (Study, Leave of Absence) — person must have been
//     employed for at least minimum_tenure_months.
func (s *Service) ListPolicies(ctx context.Context, personID *uuid.UUID) ([]LeavePolicy, error) {
	const q = `
		SELECT pol.id, pol.code, pol.name, pol.days_per_year,
		       pol.requires_approval, pol.is_active,
		       pol.is_unpaid, pol.minimum_tenure_months,
		       pol.applicable_grades,
		       COALESCE(pol.applicable_gender, '') AS applicable_gender
		FROM   hr.leave_policy pol
		WHERE  pol.is_active = true

		  -- Grade filter: for annual leave tiers, show only the tier matching
		  -- the person's grade. Universal policies (applicable_grades IS NULL)
		  -- are always visible to all staff.
		  -- Fallback: if no grade is assigned at all, show ANNUAL_L1 (22d) so
		  -- the employee is never left with zero annual leave options.
		  --
		  -- Maternity, Paternity, Study, and Leave-of-Absence are intentionally
		  -- shown to everyone — HR approves or rejects based on eligibility.
		  -- This ensures employees can see and apply for all leave types.
		  AND (
		        pol.applicable_grades IS NULL
		        OR $1::uuid IS NULL
		        OR EXISTS (
		             SELECT 1 FROM organization.assignment a
		             WHERE  a.person_id        = $1
		               AND  a.effective_to     IS NULL
		               AND  a.grade_level_code = ANY(pol.applicable_grades)
		           )
		        OR (
		             pol.code = 'ANNUAL_L1'
		             AND NOT EXISTS (
		                   SELECT 1 FROM organization.assignment a
		                   WHERE  a.person_id        = $1
		                     AND  a.effective_to     IS NULL
		                     AND  a.grade_level_code IS NOT NULL
		                 )
		           )
		  )

		ORDER BY
		    CASE WHEN pol.applicable_grades IS NOT NULL THEN 0 ELSE 1 END,
		    pol.name`
	rows, err := s.pool.Query(ctx, q, personID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LeavePolicy
	for rows.Next() {
		var p LeavePolicy
		var applicableGender string
		if err := rows.Scan(
			&p.ID, &p.Code, &p.Name, &p.DaysPerYear,
			&p.RequiresApproval, &p.IsActive,
			&p.IsUnpaid, &p.MinimumTenureMonths, &p.ApplicableGrades,
			&applicableGender,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── Requests ──────────────────────────────────────────────────────────────────

type CreateLeaveInput struct {
	PersonID           uuid.UUID  `json:"person_id"`
	PolicyID           uuid.UUID  `json:"policy_id"`
	StartDate          string     `json:"start_date"` // YYYY-MM-DD
	EndDate            string     `json:"end_date"`
	DaysCount          float64    `json:"days_count"`
	Notes              string     `json:"notes"`
	RelieverPersonID   *uuid.UUID `json:"reliever_person_id"`
	HandoverDocumentID *uuid.UUID `json:"handover_document_id"`
}

func (s *Service) CreateRequest(ctx context.Context, in CreateLeaveInput) (LeaveRequest, error) {
	start, err := time.Parse("2006-01-02", in.StartDate)
	if err != nil {
		return LeaveRequest{}, fmt.Errorf("hr: invalid start_date: %w", err)
	}
	end, err := time.Parse("2006-01-02", in.EndDate)
	if err != nil {
		return LeaveRequest{}, fmt.Errorf("hr: invalid end_date: %w", err)
	}
	if end.Before(start) {
		return LeaveRequest{}, fmt.Errorf("hr: end_date must be >= start_date")
	}
	if in.DaysCount <= 0 {
		return LeaveRequest{}, fmt.Errorf("hr: days_count must be > 0")
	}

	const q = `
		INSERT INTO hr.leave_request
		    (person_id, policy_id, start_date, end_date, days_count, notes,
		     reliever_person_id, handover_document_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`
	var id uuid.UUID
	var createdAt time.Time
	if err := s.pool.QueryRow(ctx, q,
		in.PersonID, in.PolicyID, start, end, in.DaysCount, in.Notes,
		in.RelieverPersonID, in.HandoverDocumentID,
	).Scan(&id, &createdAt); err != nil {
		return LeaveRequest{}, fmt.Errorf("hr: create leave request: %w", err)
	}
	req := LeaveRequest{
		ID: id, PersonID: in.PersonID, PolicyID: in.PolicyID,
		StartDate: in.StartDate, EndDate: in.EndDate,
		DaysCount: in.DaysCount, Notes: in.Notes,
		Status: "pending", CreatedAt: createdAt,
		RelieverPersonID:   in.RelieverPersonID,
		HandoverDocumentID: in.HandoverDocumentID,
	}

	// Notify HR managers of the new leave request.
	var personName string
	_ = s.pool.QueryRow(ctx,
		`SELECT first_name||' '||last_name FROM organization.person WHERE id=$1`, in.PersonID,
	).Scan(&personName)
	if personName != "" {
		_ = notification.SendToRole(ctx, s.pool, uuid.Nil,
			[]string{"HR_MANAGER", "HR_OFFICER", "HEAD_HR"},
			notification.InApp{
				Type:     "hr_leave_requested",
				Title:    "New Leave Request",
				Body:     fmt.Sprintf("%s has requested %.0f days leave from %s to %s.", personName, in.DaysCount, in.StartDate, in.EndDate),
				Link:     "/hr/leave",
				Priority: "medium",
			})
	}
	return req, nil
}

func (s *Service) ListRequests(ctx context.Context, personID *uuid.UUID, status string) ([]LeaveRequest, error) {
	q := `
		SELECT
			r.id, r.person_id,
			COALESCE(u.display_name, p.first_name || ' ' || p.last_name) AS person_name,
			p.email,
			COALESCE(s.name, '') AS subsidiary_name,
			r.policy_id, pol.code, pol.name,
			r.start_date::text, r.end_date::text,
			r.days_count::float8, r.status, r.notes,
			r.reviewer_person_id, r.reviewer_note,
			r.reviewed_at, r.created_at,
			r.reliever_person_id,
			COALESCE(rel.first_name || ' ' || rel.last_name, '') AS reliever_name,
			r.handover_document_id
		FROM hr.leave_request r
		JOIN organization.person    p   ON p.id    = r.person_id
		LEFT JOIN identity.users    u   ON u.id    = p.user_id
		LEFT JOIN organization.assignment a
			ON  a.person_id    = p.id
			AND a.is_primary   = true
			AND a.effective_to IS NULL
		LEFT JOIN organization.subsidiary s ON s.id = a.subsidiary_id
		JOIN hr.leave_policy pol ON pol.id = r.policy_id
		LEFT JOIN organization.person rel ON rel.id = r.reliever_person_id
		WHERE ($1::uuid IS NULL OR r.person_id = $1)
		  AND ($2::text  = ''   OR r.status    = $2)
		ORDER BY r.created_at DESC
	`
	var statusParam string
	if status != "" {
		statusParam = status
	}
	rows, err := s.pool.Query(ctx, q, personID, statusParam)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRequests(rows)
}

func scanRequests(rows pgx.Rows) ([]LeaveRequest, error) {
	var out []LeaveRequest
	for rows.Next() {
		var r LeaveRequest
		if err := rows.Scan(
			&r.ID, &r.PersonID, &r.PersonName, &r.PersonEmail, &r.SubsidiaryName,
			&r.PolicyID, &r.PolicyCode, &r.PolicyName,
			&r.StartDate, &r.EndDate, &r.DaysCount,
			&r.Status, &r.Notes, &r.ReviewerPersonID, &r.ReviewerNote,
			&r.ReviewedAt, &r.CreatedAt,
			&r.RelieverPersonID, &r.RelieverName, &r.HandoverDocumentID,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type ReviewInput struct {
	RequestID        uuid.UUID `json:"request_id"`
	ReviewerPersonID uuid.UUID `json:"reviewer_person_id"`
	Action           string    `json:"action"` // "approve" | "reject" | "cancel"
	ReviewerNote     string    `json:"reviewer_note"`
}

func (s *Service) ReviewRequest(ctx context.Context, in ReviewInput) error {
	newStatus := map[string]string{
		"approve": "approved",
		"reject":  "rejected",
		"cancel":  "cancelled",
	}[in.Action]
	if newStatus == "" {
		return fmt.Errorf("hr: unknown action %q", in.Action)
	}

	const q = `
		UPDATE hr.leave_request
		SET    status             = $1,
		       reviewer_person_id = $2,
		       reviewer_note      = $3,
		       reviewed_at        = now(),
		       updated_at         = now()
		WHERE  id     = $4
		  AND  status = 'pending'
	`
	tag, err := s.pool.Exec(ctx, q, newStatus, in.ReviewerPersonID, in.ReviewerNote, in.RequestID)
	if err != nil {
		return fmt.Errorf("hr: review request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("hr: request not found or already reviewed")
	}

	// Notify employee of the decision.
	if in.Action == "approve" || in.Action == "reject" {
		var personID uuid.UUID
		var start, end string
		_ = s.pool.QueryRow(ctx,
			`SELECT person_id, start_date::text, end_date::text FROM hr.leave_request WHERE id=$1`,
			in.RequestID,
		).Scan(&personID, &start, &end)
		if personID != uuid.Nil {
			title := "Leave Request Approved"
			body := fmt.Sprintf("Your leave from %s to %s has been approved.", start, end)
			priority := "medium"
			if in.Action == "reject" {
				title = "Leave Request Declined"
				body = fmt.Sprintf("Your leave request from %s to %s has been declined.", start, end)
				priority = "high"
			}
			_ = notification.SendToUser(ctx, s.pool, personID, notification.InApp{
				Type: "hr_leave_" + in.Action + "d", Title: title, Body: body,
				Link: "/leave", Priority: priority,
			})
		}
	}
	return nil
}

// ── Balance ───────────────────────────────────────────────────────────────────

func (s *Service) GetBalance(ctx context.Context, personID uuid.UUID, year int) ([]LeaveBalance, error) {
	const q = `
		SELECT pol.id, pol.code, pol.name,
		       COALESCE(b.days_granted, pol.days_per_year)::float8 AS days_granted,
		       COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.days_count ELSE 0 END), 0)::float8 AS days_used
		FROM   hr.leave_policy pol
		LEFT   JOIN hr.leave_balance b ON b.person_id = $1 AND b.policy_id = pol.id AND b.year = $2
		LEFT   JOIN hr.leave_request lr ON lr.person_id = $1 AND lr.policy_id = pol.id
		                                AND EXTRACT(year FROM lr.start_date)::int = $2
		                                AND lr.status = 'approved'
		WHERE  pol.is_active = true
		GROUP  BY pol.id, pol.code, pol.name, b.days_granted
		ORDER  BY pol.name
	`
	rows, err := s.pool.Query(ctx, q, personID, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LeaveBalance
	for rows.Next() {
		var b LeaveBalance
		b.Year = year
		if err := rows.Scan(&b.PolicyID, &b.PolicyCode, &b.PolicyName, &b.DaysGranted, &b.DaysUsed); err != nil {
			return nil, err
		}
		b.DaysRemaining = b.DaysGranted - b.DaysUsed
		out = append(out, b)
	}
	return out, rows.Err()
}

// SetBalance allows HR to override the days_granted for a person/policy/year.
func (s *Service) SetBalance(ctx context.Context, personID, policyID uuid.UUID, year int, daysGranted float64) error {
	const q = `
		INSERT INTO hr.leave_balance (person_id, policy_id, year, days_granted)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (person_id, policy_id, year)
		DO UPDATE SET days_granted = EXCLUDED.days_granted
	`
	_, err := s.pool.Exec(ctx, q, personID, policyID, year, daysGranted)
	return err
}

// ── Document requests ─────────────────────────────────────────────────────────

// CommonDocumentTypes is the predefined list HR selects from.
var CommonDocumentTypes = []string{
	"Academic Certificate",
	"Professional Certification",
	"Means of Identification (NIN / Passport / Driver's Licence)",
	"Passport Photograph",
	"Birth Certificate",
	"Medical / Health Certificate",
	"Previous Employment Letter",
	"Reference Letter",
	"Proof of Address (Utility Bill)",
	"Bank Account Details",
	"Pension RSA PIN",
	"Tax Identification Number (TIN)",
	"Signed Employment Contract",
	"Emergency Contact / Next of Kin Form",
	"Other",
}

type DocumentRequest struct {
	ID            uuid.UUID  `json:"id"`
	PersonID      uuid.UUID  `json:"person_id"`
	PersonName    string     `json:"person_name"`
	PersonEmail   string     `json:"person_email"`
	RequestedBy   uuid.UUID  `json:"requested_by"`
	RequesterName string     `json:"requester_name"`
	DocumentType  string     `json:"document_type"`
	Notes         string     `json:"notes"`
	DueDate       *string    `json:"due_date,omitempty"`
	Status        string     `json:"status"` // pending | uploaded | declined
	DocumentID    *uuid.UUID `json:"document_id,omitempty"`
	DeclinedNote  string     `json:"declined_note,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type CreateDocumentRequestInput struct {
	PersonID     uuid.UUID `json:"person_id"`
	DocumentType string    `json:"document_type"`
	Notes        string    `json:"notes"`
	DueDate      string    `json:"due_date"` // YYYY-MM-DD, optional
}

// CreateDocumentRequest creates a request and sends the employee an email.
func (s *Service) CreateDocumentRequest(ctx context.Context, in CreateDocumentRequestInput, requestedByID uuid.UUID, requestedByName string) (DocumentRequest, error) {
	if in.DocumentType == "" {
		return DocumentRequest{}, fmt.Errorf("hr: document_type required")
	}

	// Resolve employee email for notification
	var personName, personEmail string
	if err := s.pool.QueryRow(ctx,
		`SELECT first_name || ' ' || last_name, COALESCE(email,'')
		 FROM organization.person WHERE id = $1`, in.PersonID,
	).Scan(&personName, &personEmail); err != nil {
		return DocumentRequest{}, fmt.Errorf("hr: person %s not found: %w", in.PersonID, err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DocumentRequest{}, err
	}
	defer tx.Rollback(ctx)

	var dueDate *string
	if in.DueDate != "" {
		d := in.DueDate
		dueDate = &d
	}

	var req DocumentRequest
	if err := tx.QueryRow(ctx, `
		INSERT INTO documents.document_request
		    (person_id, requested_by, document_type, notes, due_date)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, person_id, requested_by, document_type,
		          notes, due_date::text, status, document_id, declined_note,
		          created_at, updated_at
	`, in.PersonID, requestedByID, in.DocumentType, in.Notes, dueDate,
	).Scan(&req.ID, &req.PersonID, &req.RequestedBy, &req.DocumentType,
		&req.Notes, &req.DueDate, &req.Status, &req.DocumentID, &req.DeclinedNote,
		&req.CreatedAt, &req.UpdatedAt,
	); err != nil {
		return DocumentRequest{}, fmt.Errorf("hr: create document request: %w", err)
	}
	// Fill in the already-resolved names from local variables — these cannot
	// appear in the RETURNING clause (PostgreSQL does not allow query parameters there).
	req.PersonName = personName
	req.PersonEmail = personEmail
	req.RequesterName = requestedByName

	// Enqueue email notification to employee
	if personEmail != "" {
		dueStr := ""
		if dueDate != nil {
			dueStr = " Please upload by " + *dueDate + "."
		}
		body := fmt.Sprintf(
			"Dear %s,\n\nHR has requested the following document from you:\n\n"+
				"Document: %s\n%s\n%s\n\n"+
				"Please log in to PageOS and upload the document at your earliest convenience.\n\n"+
				"Regards,\nPageOS HR System",
			personName, in.DocumentType,
			func() string {
				if in.Notes != "" {
					return "Notes: " + in.Notes
				}
				return ""
			}(),
			dueStr,
		)
		_ = notification.Shared().Enqueue(ctx, tx, notification.Message{
			EventType:     "hr.document_request.created",
			TargetAddress: personEmail,
			Subject:       "Action Required: Please upload your " + in.DocumentType,
			BodyText:      body,
			Payload:       map[string]any{"request_id": req.ID, "person_id": in.PersonID},
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return DocumentRequest{}, err
	}

	// In-app notification to the employee (best-effort, post-commit).
	dueStr := ""
	if req.DueDate != nil {
		dueStr = fmt.Sprintf(" Please upload by %s.", *req.DueDate)
	}
	_ = notification.SendToUser(ctx, s.pool, in.PersonID, notification.InApp{
		Type:     "hr_document_requested",
		Title:    "Document Request from HR",
		Body:     fmt.Sprintf("HR has requested your %s.%s", in.DocumentType, dueStr),
		Link:     "/hr/documents/my",
		Priority: "high",
	})

	return req, nil
}

// ListDocumentRequests returns requests visible to HR (all) or an employee (their own).
func (s *Service) ListDocumentRequests(ctx context.Context, personID *uuid.UUID, status string) ([]DocumentRequest, error) {
	const q = `
		SELECT dr.id,
		       dr.person_id,
		       p.first_name || ' ' || p.last_name AS person_name,
		       COALESCE(p.email, '')               AS person_email,
		       dr.requested_by,
		       COALESCE(rp.first_name || ' ' || rp.last_name, 'HR') AS requester_name,
		       dr.document_type, dr.notes,
		       dr.due_date::text, dr.status, dr.document_id,
		       COALESCE(dr.declined_note, ''),
		       dr.created_at, dr.updated_at
		FROM   documents.document_request dr
		JOIN   organization.person p   ON p.id  = dr.person_id
		LEFT   JOIN organization.person rp ON rp.id = dr.requested_by
		WHERE  ($1::uuid IS NULL OR dr.person_id   = $1)
		  AND  ($2::text  = ''   OR dr.status       = $2)
		ORDER  BY dr.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, personID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDocumentRequests(rows)
}

// FulfillDocumentRequest marks the request as uploaded, linking the document.
func (s *Service) FulfillDocumentRequest(ctx context.Context, requestID, documentID, byPersonID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE documents.document_request
		SET    status      = 'uploaded',
		       document_id = $2,
		       updated_at  = now()
		WHERE  id          = $1
		  AND  person_id   = $3
		  AND  status      = 'pending'
	`, requestID, documentID, byPersonID)
	if err != nil {
		return err
	}
	// Notify HR managers that the employee uploaded a document.
	var personName, docType string
	_ = s.pool.QueryRow(ctx, `
		SELECT p.first_name||' '||p.last_name, dr.document_type
		FROM documents.document_request dr
		JOIN organization.person p ON p.id = dr.person_id
		WHERE dr.id = $1`, requestID,
	).Scan(&personName, &docType)
	if personName != "" {
		_ = notification.SendToRole(ctx, s.pool, uuid.Nil,
			[]string{"HR_MANAGER", "HR_OFFICER", "HEAD_HR"},
			notification.InApp{
				Type:     "hr_document_uploaded",
				Title:    "Document Uploaded",
				Body:     fmt.Sprintf("%s has uploaded their %s.", personName, docType),
				Link:     "/hr/documents",
				Priority: "medium",
			})
	}
	return nil
}

// DeclineDocumentRequest lets an employee mark a request as declined with a reason.
func (s *Service) DeclineDocumentRequest(ctx context.Context, requestID, byPersonID uuid.UUID, note string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE documents.document_request
		SET    status        = 'declined',
		       declined_note = $2,
		       updated_at    = now()
		WHERE  id            = $1
		  AND  person_id     = $3
		  AND  status        = 'pending'
	`, requestID, note, byPersonID)
	return err
}

// SendReminder re-enqueues the notification email for a pending request.
func (s *Service) SendReminder(ctx context.Context, requestID uuid.UUID) error {
	var personEmail, personName, docType, notes string
	var dueDate *string
	if err := s.pool.QueryRow(ctx, `
		SELECT p.email, p.first_name || ' ' || p.last_name,
		       dr.document_type, dr.notes, dr.due_date::text
		FROM   documents.document_request dr
		JOIN   organization.person p ON p.id = dr.person_id
		WHERE  dr.id = $1 AND dr.status = 'pending'
	`, requestID).Scan(&personEmail, &personName, &docType, &notes, &dueDate); err != nil {
		return fmt.Errorf("hr: request not found or already completed")
	}
	if personEmail == "" {
		return fmt.Errorf("hr: employee has no email address")
	}

	dueStr := ""
	if dueDate != nil {
		dueStr = " Please upload by " + *dueDate + "."
	}
	body := fmt.Sprintf(
		"Dear %s,\n\nThis is a reminder that HR is still awaiting the following document:\n\n"+
			"Document: %s\n%s\n%s\n\n"+
			"Please log in to PageOS and upload the document at your earliest convenience.\n\n"+
			"Regards,\nPageOS HR System",
		personName, docType,
		func() string {
			if notes != "" {
				return "Notes: " + notes
			}
			return ""
		}(),
		dueStr,
	)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := notification.Shared().Enqueue(ctx, tx, notification.Message{
		EventType:     "hr.document_request.reminder",
		TargetAddress: personEmail,
		Subject:       "Reminder: Please upload your " + docType,
		BodyText:      body,
	}); err != nil {
		return fmt.Errorf("hr: enqueue reminder: %w", err)
	}
	return tx.Commit(ctx)
}

func scanDocumentRequests(rows pgx.Rows) ([]DocumentRequest, error) {
	var out []DocumentRequest
	for rows.Next() {
		var r DocumentRequest
		if err := rows.Scan(
			&r.ID, &r.PersonID, &r.PersonName, &r.PersonEmail,
			&r.RequestedBy, &r.RequesterName, &r.DocumentType, &r.Notes,
			&r.DueDate, &r.Status, &r.DocumentID, &r.DeclinedNote,
			&r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
