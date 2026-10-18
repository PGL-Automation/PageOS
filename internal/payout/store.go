package payout

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// store is the raw-SQL data layer for the payout module.
// All transactional methods accept a pgx.Tx so the caller can enqueue
// notification messages inside the same transaction.
type store struct {
	pool *pgxpool.Pool
}

func newStore(pool *pgxpool.Pool) *store { return &store{pool: pool} }

// ---------------------------------------------------------------------------
// Payment requests
// ---------------------------------------------------------------------------

func (s *store) createRequest(
	ctx context.Context,
	subsidiaryID uuid.UUID,
	requestType string,
	paymentAccountID uuid.UUID,
	amountKobo int64,
	benefName, benefBank, benefAcct string,
	purpose string,
	raisedBy uuid.UUID,
) (PaymentRequest, error) {
	const q = `
		INSERT INTO payout.payment_request
		    (subsidiary_id, request_type, payment_account_id, amount_kobo,
		     beneficiary_name, beneficiary_bank, beneficiary_account, purpose,
		     raised_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING
		    id, instruction_id, subsidiary_id, request_type, payment_account_id,
		    amount_kobo, beneficiary_name, beneficiary_bank, beneficiary_account,
		    purpose, supporting_doc_path, status, compliance_flagged,
		    raised_by, submitted_at, approved_at, bank_reference,
		    confirmation_doc_path, created_at, updated_at
	`
	var r PaymentRequest
	err := s.pool.QueryRow(ctx, q,
		subsidiaryID, requestType, paymentAccountID, amountKobo,
		benefName, benefBank, benefAcct, purpose, raisedBy,
	).Scan(
		&r.ID, &r.InstructionID, &r.SubsidiaryID, &r.RequestType, &r.PaymentAccountID,
		&r.AmountKobo, &r.BeneficiaryName, &r.BeneficiaryBank, &r.BeneficiaryAccount,
		&r.Purpose, &r.SupportingDocPath, &r.Status, &r.ComplianceFlagged,
		&r.RaisedBy, &r.SubmittedAt, &r.ApprovedAt, &r.BankReference,
		&r.ConfirmationDocPath, &r.CreatedAt, &r.UpdatedAt,
	)
	return r, err
}

func (s *store) getRequest(ctx context.Context, id uuid.UUID) (PaymentRequest, error) {
	const q = `
		SELECT
		    id, instruction_id, subsidiary_id, request_type, payment_account_id,
		    amount_kobo, beneficiary_name, beneficiary_bank, beneficiary_account,
		    purpose, supporting_doc_path, status, compliance_flagged,
		    raised_by, submitted_at, approved_at, bank_reference,
		    confirmation_doc_path, created_at, updated_at
		FROM payout.payment_request
		WHERE id = $1
	`
	var r PaymentRequest
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&r.ID, &r.InstructionID, &r.SubsidiaryID, &r.RequestType, &r.PaymentAccountID,
		&r.AmountKobo, &r.BeneficiaryName, &r.BeneficiaryBank, &r.BeneficiaryAccount,
		&r.Purpose, &r.SupportingDocPath, &r.Status, &r.ComplianceFlagged,
		&r.RaisedBy, &r.SubmittedAt, &r.ApprovedAt, &r.BankReference,
		&r.ConfirmationDocPath, &r.CreatedAt, &r.UpdatedAt,
	)
	return r, err
}

// listRequests returns payment requests filtered by optional subsidiaryID, status,
// and mine (only requests raised by userID).
func (s *store) listRequests(
	ctx context.Context,
	subsidiaryID uuid.UUID,
	status string,
	mine bool,
	userID uuid.UUID,
) ([]PaymentRequest, error) {
	// Build a flexible WHERE clause rather than dozens of query variants.
	args := []any{}
	clauses := []string{"1=1"}

	if subsidiaryID != uuid.Nil {
		args = append(args, subsidiaryID)
		clauses = append(clauses, "subsidiary_id = $"+itoa(len(args)))
	}
	if status != "" {
		args = append(args, status)
		clauses = append(clauses, "status = $"+itoa(len(args)))
	}
	if mine {
		args = append(args, userID)
		clauses = append(clauses, "raised_by = $"+itoa(len(args)))
	}

	q := `
		SELECT
		    id, instruction_id, subsidiary_id, request_type, payment_account_id,
		    amount_kobo, beneficiary_name, beneficiary_bank, beneficiary_account,
		    purpose, supporting_doc_path, status, compliance_flagged,
		    raised_by, submitted_at, approved_at, bank_reference,
		    confirmation_doc_path, created_at, updated_at
		FROM payout.payment_request
		WHERE ` + strings.Join(clauses, " AND ") + `
		ORDER BY created_at DESC
	`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PaymentRequest
	for rows.Next() {
		var r PaymentRequest
		if err := rows.Scan(
			&r.ID, &r.InstructionID, &r.SubsidiaryID, &r.RequestType, &r.PaymentAccountID,
			&r.AmountKobo, &r.BeneficiaryName, &r.BeneficiaryBank, &r.BeneficiaryAccount,
			&r.Purpose, &r.SupportingDocPath, &r.Status, &r.ComplianceFlagged,
			&r.RaisedBy, &r.SubmittedAt, &r.ApprovedAt, &r.BankReference,
			&r.ConfirmationDocPath, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// submitRequest stamps instruction_id, sets flagged, moves status to submitted,
// and records submitted_at — all inside the caller's transaction.
func (s *store) submitRequest(ctx context.Context, tx pgx.Tx, id uuid.UUID, instructionID string, flagged bool) error {
	const q = `
		UPDATE payout.payment_request
		SET instruction_id    = $2,
		    compliance_flagged = $3,
		    status            = 'submitted',
		    submitted_at      = now(),
		    updated_at        = now()
		WHERE id = $1
	`
	_, err := tx.Exec(ctx, q, id, instructionID, flagged)
	return err
}

// updateRequestStatus sets a new status and bumps updated_at.
func (s *store) updateRequestStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string) error {
	const q = `
		UPDATE payout.payment_request
		SET status     = $2,
		    updated_at = now()
		WHERE id = $1
	`
	_, err := tx.Exec(ctx, q, id, status)
	return err
}

// updateBankReference stores the bank reference and moves status to sent_to_bank.
func (s *store) updateBankReference(ctx context.Context, tx pgx.Tx, id uuid.UUID, bankRef string) error {
	const q = `
		UPDATE payout.payment_request
		SET bank_reference = $2,
		    status         = 'sent_to_bank',
		    updated_at     = now()
		WHERE id = $1
	`
	_, err := tx.Exec(ctx, q, id, bankRef)
	return err
}

// updateConfirmation stores the confirmation document path and moves status to confirmed.
func (s *store) updateConfirmation(ctx context.Context, tx pgx.Tx, id uuid.UUID, docPath string) error {
	const q = `
		UPDATE payout.payment_request
		SET confirmation_doc_path = $2,
		    status                = 'confirmed',
		    updated_at            = now()
		WHERE id = $1
	`
	_, err := tx.Exec(ctx, q, id, docPath)
	return err
}

// countRequestsForYear returns the total number of requests for a given
// subsidiary in a calendar year — used to compute the next instruction_id sequence.
func (s *store) countRequestsForYear(ctx context.Context, subsidiaryID uuid.UUID, year int) (int64, error) {
	const q = `
		SELECT COUNT(*)
		FROM payout.payment_request
		WHERE subsidiary_id = $1
		  AND EXTRACT(year FROM created_at) = $2
	`
	var n int64
	err := s.pool.QueryRow(ctx, q, subsidiaryID, year).Scan(&n)
	return n, err
}

// ---------------------------------------------------------------------------
// Approval steps
// ---------------------------------------------------------------------------

// createStep inserts a single approval step inside a transaction.
func (s *store) createStep(ctx context.Context, tx pgx.Tx, step ApprovalStep) error {
	const q = `
		INSERT INTO payout.approval_step
		    (id, request_id, step_order, step_type, assigned_to, stand_in_for,
		     status, due_by, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`
	_, err := tx.Exec(ctx, q,
		step.ID, step.RequestID, step.StepOrder, step.StepType,
		step.AssignedTo, step.StandInFor, step.Status, step.DueBy, step.Notes,
	)
	return err
}

// getActiveStep returns the lowest-order pending step for a request.
func (s *store) getActiveStep(ctx context.Context, requestID uuid.UUID) (ApprovalStep, error) {
	const q = `
		SELECT
		    id, request_id, step_order, step_type, assigned_to, stand_in_for,
		    status, due_by, reminder_sent_at, escalated_at, decided_at, notes, created_at
		FROM payout.approval_step
		WHERE request_id = $1
		  AND status = 'pending'
		ORDER BY step_order ASC
		LIMIT 1
	`
	var st ApprovalStep
	err := s.pool.QueryRow(ctx, q, requestID).Scan(
		&st.ID, &st.RequestID, &st.StepOrder, &st.StepType, &st.AssignedTo, &st.StandInFor,
		&st.Status, &st.DueBy, &st.ReminderSentAt, &st.EscalatedAt, &st.DecidedAt, &st.Notes, &st.CreatedAt,
	)
	return st, err
}

// getStepsForRequest returns all steps for a request in step_order.
func (s *store) getStepsForRequest(ctx context.Context, requestID uuid.UUID) ([]ApprovalStep, error) {
	const q = `
		SELECT
		    id, request_id, step_order, step_type, assigned_to, stand_in_for,
		    status, due_by, reminder_sent_at, escalated_at, decided_at, notes, created_at
		FROM payout.approval_step
		WHERE request_id = $1
		ORDER BY step_order ASC
	`
	rows, err := s.pool.Query(ctx, q, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ApprovalStep
	for rows.Next() {
		var st ApprovalStep
		if err := rows.Scan(
			&st.ID, &st.RequestID, &st.StepOrder, &st.StepType, &st.AssignedTo, &st.StandInFor,
			&st.Status, &st.DueBy, &st.ReminderSentAt, &st.EscalatedAt, &st.DecidedAt, &st.Notes, &st.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// getPendingStepsForUser returns all pending steps assigned to a user, with the
// instruction_id of the parent request included for display purposes.
func (s *store) getPendingStepsForUser(ctx context.Context, userID uuid.UUID) ([]ApprovalStep, error) {
	const q = `
		SELECT
		    s.id, s.request_id, s.step_order, s.step_type, s.assigned_to, s.stand_in_for,
		    s.status, s.due_by, s.reminder_sent_at, s.escalated_at, s.decided_at, s.notes,
		    s.created_at,
		    COALESCE(r.instruction_id, '')  AS request_inst_id
		FROM payout.approval_step  s
		JOIN payout.payment_request r ON r.id = s.request_id
		WHERE s.assigned_to = $1
		  AND s.status = 'pending'
		ORDER BY s.due_by ASC
	`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ApprovalStep
	for rows.Next() {
		var st ApprovalStep
		if err := rows.Scan(
			&st.ID, &st.RequestID, &st.StepOrder, &st.StepType, &st.AssignedTo, &st.StandInFor,
			&st.Status, &st.DueBy, &st.ReminderSentAt, &st.EscalatedAt, &st.DecidedAt, &st.Notes,
			&st.CreatedAt,
			&st.RequestInstID,
		); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// advanceStep marks a step decided (approved/returned/rejected) inside a transaction.
func (s *store) advanceStep(
	ctx context.Context,
	tx pgx.Tx,
	stepID uuid.UUID,
	status string,
	decidedBy uuid.UUID,
	notes string,
) error {
	// decided_by is not a schema column (steps only record assigned_to / stand_in_for).
	// The caller logs the decision via logAction. We record status, decided_at, notes.
	const q = `
		UPDATE payout.approval_step
		SET status     = $2,
		    decided_at = now(),
		    notes      = $3
		WHERE id = $1
	`
	_, err := tx.Exec(ctx, q, stepID, status, notes)
	return err
}

// getOverdueSteps returns all pending steps past their due_by time, together
// with the step duration in minutes (derived from the gap between consecutive
// steps, approximated as the step's own due_by window for escalation logic).
// The scheduler uses this to send reminders and escalate.
func (s *store) getOverdueSteps(ctx context.Context) ([]ApprovalStep, error) {
	const q = `
		SELECT
		    s.id, s.request_id, s.step_order, s.step_type, s.assigned_to, s.stand_in_for,
		    s.status, s.due_by, s.reminder_sent_at, s.escalated_at, s.decided_at, s.notes,
		    s.created_at,
		    COALESCE(r.instruction_id, '')                          AS request_inst_id,
		    EXTRACT(EPOCH FROM (s.due_by - s.created_at)) / 60     AS step_limit_minutes
		FROM payout.approval_step  s
		JOIN payout.payment_request r ON r.id = s.request_id
		WHERE s.status = 'pending'
		  AND now() > s.due_by
		ORDER BY s.due_by ASC
	`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ApprovalStep
	for rows.Next() {
		var st ApprovalStep
		var limitMinutes float64
		if err := rows.Scan(
			&st.ID, &st.RequestID, &st.StepOrder, &st.StepType, &st.AssignedTo, &st.StandInFor,
			&st.Status, &st.DueBy, &st.ReminderSentAt, &st.EscalatedAt, &st.DecidedAt, &st.Notes,
			&st.CreatedAt,
			&st.RequestInstID,
			&limitMinutes,
		); err != nil {
			return nil, err
		}
		st.StepLimitMinutes = int(limitMinutes)
		out = append(out, st)
	}
	return out, rows.Err()
}

// markReminderSent stamps reminder_sent_at = now() on a step.
func (s *store) markReminderSent(ctx context.Context, stepID uuid.UUID) error {
	const q = `
		UPDATE payout.approval_step
		SET reminder_sent_at = now()
		WHERE id = $1
	`
	_, err := s.pool.Exec(ctx, q, stepID)
	return err
}

// escalateStep reassigns the step to coverUserID, records who it was escalated
// from in stand_in_for, and stamps escalated_at.
func (s *store) escalateStep(ctx context.Context, stepID uuid.UUID, coverUserID uuid.UUID) error {
	const q = `
		UPDATE payout.approval_step
		SET stand_in_for = assigned_to,
		    assigned_to  = $2,
		    escalated_at = now()
		WHERE id = $1
	`
	_, err := s.pool.Exec(ctx, q, stepID, coverUserID)
	return err
}

// ---------------------------------------------------------------------------
// Action log
// ---------------------------------------------------------------------------

// logAction appends an immutable audit entry inside a transaction.
func (s *store) logAction(ctx context.Context, tx pgx.Tx, entry ActionLog) error {
	const q = `
		INSERT INTO payout.action_log
		    (id, request_id, step_id, actor_user_id, action, notes, source)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`
	_, err := tx.Exec(ctx, q,
		entry.ID, entry.RequestID, entry.StepID, entry.ActorUserID,
		entry.Action, entry.Notes, entry.Source,
	)
	return err
}

// getActionLog returns all log entries for a request in chronological order.
func (s *store) getActionLog(ctx context.Context, requestID uuid.UUID) ([]ActionLog, error) {
	const q = `
		SELECT id, request_id, step_id, actor_user_id, action, notes, source, created_at
		FROM payout.action_log
		WHERE request_id = $1
		ORDER BY created_at ASC
	`
	rows, err := s.pool.Query(ctx, q, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ActionLog
	for rows.Next() {
		var l ActionLog
		if err := rows.Scan(
			&l.ID, &l.RequestID, &l.StepID, &l.ActorUserID,
			&l.Action, &l.Notes, &l.Source, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Beneficiaries & payment accounts
// ---------------------------------------------------------------------------

// listBeneficiaries returns active client beneficiaries for a subsidiary.
func (s *store) listBeneficiaries(ctx context.Context, subsidiaryID uuid.UUID) ([]ClientBeneficiary, error) {
	const q = `
		SELECT id, subsidiary_id, client_name, client_id, bank_name,
		       account_number, account_name, is_active, created_at
		FROM payout.client_beneficiary
		WHERE subsidiary_id = $1
		  AND is_active = true
		ORDER BY client_name ASC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ClientBeneficiary
	for rows.Next() {
		var b ClientBeneficiary
		if err := rows.Scan(
			&b.ID, &b.SubsidiaryID, &b.ClientName, &b.ClientID, &b.BankName,
			&b.AccountNumber, &b.AccountName, &b.IsActive, &b.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// checkBeneficiary reports whether an account_number is registered for a subsidiary.
func (s *store) checkBeneficiary(ctx context.Context, subsidiaryID uuid.UUID, accountNumber string) (bool, error) {
	const q = `
		SELECT EXISTS (
		    SELECT 1 FROM payout.client_beneficiary
		    WHERE subsidiary_id = $1 AND account_number = $2 AND is_active = true
		)
	`
	var found bool
	err := s.pool.QueryRow(ctx, q, subsidiaryID, accountNumber).Scan(&found)
	return found, err
}

// listPaymentAccounts returns active payment accounts for a subsidiary.
func (s *store) listPaymentAccounts(ctx context.Context, subsidiaryID uuid.UUID) ([]PaymentAccount, error) {
	const q = `
		SELECT id, subsidiary_id, bank_name, account_name, account_number,
		       cut_off_time, is_active, created_at
		FROM payout.payment_account
		WHERE subsidiary_id = $1
		  AND is_active = true
		ORDER BY bank_name ASC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PaymentAccount
	for rows.Next() {
		var a PaymentAccount
		if err := rows.Scan(
			&a.ID, &a.SubsidiaryID, &a.BankName, &a.AccountName, &a.AccountNumber,
			&a.CutOffTime, &a.IsActive, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// getPaymentAccount returns a single payment account by its primary key.
func (s *store) getPaymentAccount(ctx context.Context, id uuid.UUID) (PaymentAccount, error) {
	const q = `
		SELECT id, subsidiary_id, bank_name, account_name, account_number,
		       cut_off_time, is_active, created_at
		FROM payout.payment_account
		WHERE id = $1
	`
	var a PaymentAccount
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&a.ID, &a.SubsidiaryID, &a.BankName, &a.AccountName, &a.AccountNumber,
		&a.CutOffTime, &a.IsActive, &a.CreatedAt,
	)
	return a, err
}

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

// getUserEmail fetches the email address and display name for a user from
// identity.users. display_name falls back to first_name + last_name.
func (s *store) getUserEmail(ctx context.Context, userID uuid.UUID) (email string, displayName string, err error) {
	const q = `
		SELECT email,
		       COALESCE(NULLIF(display_name,''), TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')))
		FROM identity.users
		WHERE id = $1
	`
	err = s.pool.QueryRow(ctx, q, userID).Scan(&email, &displayName)
	return
}

// getStandIn returns the cover_user_id configured for userID, if any.
func (s *store) getStandIn(ctx context.Context, userID uuid.UUID) (coverUserID uuid.UUID, found bool, err error) {
	const q = `
		SELECT cover_user_id
		FROM payout.stand_in
		WHERE user_id = $1
		  AND cover_user_id IS NOT NULL
	`
	err = s.pool.QueryRow(ctx, q, userID).Scan(&coverUserID)
	if err == pgx.ErrNoRows {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	return coverUserID, true, nil
}

// ---------------------------------------------------------------------------
// Organisation helpers
// ---------------------------------------------------------------------------

// getSubsidiaryCode derives the three-letter payout prefix from the subsidiary
// name stored in organization.subsidiary.
func (s *store) getSubsidiaryCode(ctx context.Context, subsidiaryID uuid.UUID) (string, error) {
	const q = `SELECT name FROM organization.subsidiary WHERE id = $1`
	var name string
	if err := s.pool.QueryRow(ctx, q, subsidiaryID).Scan(&name); err != nil {
		return "", err
	}
	switch {
	case strings.HasPrefix(name, "Page Asset"):
		return "PAM", nil
	case strings.HasPrefix(name, "Page Capital"):
		return "PCL", nil
	default:
		return "PAG", nil
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// itoa converts a small positive integer to its decimal string representation
// without importing strconv into every call site.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}

// dummy reference to keep time import satisfied for any future use by callers
// that include scheduler helpers in this file.
var _ = time.Now
