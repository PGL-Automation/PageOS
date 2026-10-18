package payout

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/pagegroup/pageos/internal/notification"
)

// baseURL is the frontend origin used in notification links.
var baseURL = func() string {
	if v := os.Getenv("PAGEOS_FRONTEND_URL"); v != "" {
		return v
	}
	return "https://app.pageos.org"
}()

// st is a lazily-initialised store bound to the service pool.
func (s *Service) st() *store { return newStore(s.pool) }

// ── Helpers ───────────────────────────────────────────────────────────────────

// formatNaira converts a kobo amount to a human-readable Naira string.
func formatNaira(kobo int64) string {
	whole := kobo / 100
	frac := kobo % 100
	if frac == 0 {
		return fmt.Sprintf("₦%s", commaSep(whole))
	}
	return fmt.Sprintf("₦%s.%02d", commaSep(whole), frac)
}

// commaSep formats an integer with thousand-separator commas.
func commaSep(n int64) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	out := make([]byte, 0, len(s)+len(s)/3)
	rem := len(s) % 3
	if rem > 0 {
		out = append(out, s[:rem]...)
	}
	for i := rem; i < len(s); i += 3 {
		if len(out) > 0 {
			out = append(out, ',')
		}
		out = append(out, s[i:i+3]...)
	}
	return string(out)
}

// zeroPad6 returns n as a zero-padded 6-digit string.
func zeroPad6(n int64) string { return fmt.Sprintf("%06d", n) }

// stepTypeToRequestStatus maps an approval step type to the corresponding
// payment-request status used while that step is active.
func stepTypeToRequestStatus(st StepType) RequestStatus {
	switch st {
	case StepTypeHeadConcur:
		return RequestStatusHeadConcur
	case StepTypeInternalControl:
		return RequestStatusInternalControl
	case StepTypeCompliance:
		return RequestStatusCompliance
	case StepTypeFinanceCheck:
		return RequestStatusFinanceCheck
	case StepTypeSignatory1, StepTypeSignatory2:
		return RequestStatusPendingSignatories
	case StepTypeMD, StepTypeCEO:
		return RequestStatusFinanceCheck // MD/CEO use finance_check bucket in status
	default:
		return RequestStatusSubmitted
	}
}

// enqueueStepEmail sends an "action required" notification to the step assignee.
func (s *Service) enqueueStepEmail(
	ctx context.Context,
	tx pgx.Tx,
	requestID uuid.UUID,
	instructionID string,
	amountKobo int64,
	benefName string,
	stepType StepType,
	assigneeID uuid.UUID,
) error {
	email, _, err := s.st().getUserEmail(ctx, assigneeID)
	if err != nil {
		// Non-fatal: log and skip rather than blocking the transaction.
		s.logger.Warn("payout: could not fetch assignee email", "user_id", assigneeID, "err", err)
		return nil
	}

	verb := "Approve"
	switch stepType {
	case StepTypeHeadConcur:
		verb = "Concur"
	case StepTypeInternalControl:
		verb = "Internal Control Review"
	case StepTypeCompliance:
		verb = "Compliance Review"
	case StepTypeFinanceCheck:
		verb = "Finance Check"
	case StepTypeSignatory1, StepTypeSignatory2:
		verb = "Sign"
	case StepTypeMD:
		verb = "MD Approval"
	case StepTypeCEO:
		verb = "CEO Approval"
	}

	subject := fmt.Sprintf("[%s] Action required – %s: %s to %s",
		instructionID, verb, formatNaira(amountKobo), benefName)
	body := fmt.Sprintf(
		"You have a pending approval action.\n\n"+
			"Instruction: %s\n"+
			"Amount:      %s\n"+
			"Beneficiary: %s\n"+
			"Action:      %s\n\n"+
			"Review and act here:\n%s/approvals/%s",
		instructionID, formatNaira(amountKobo), benefName, verb,
		baseURL, requestID,
	)

	return s.notif.Enqueue(ctx, tx, notification.Message{
		EventType:     "payout.step_action",
		TargetAddress: email,
		Subject:       subject,
		BodyText:      body,
	})
}

// enqueueRaiserEmail sends a status notification (returned/rejected/approved) to
// the person who raised the payment request.
func (s *Service) enqueueRaiserEmail(
	ctx context.Context,
	tx pgx.Tx,
	requestID uuid.UUID,
	instructionID string,
	amountKobo int64,
	benefName string,
	raiserID uuid.UUID,
	action ActionType,
	notes string,
) error {
	email, _, err := s.st().getUserEmail(ctx, raiserID)
	if err != nil {
		s.logger.Warn("payout: could not fetch raiser email", "user_id", raiserID, "err", err)
		return nil
	}

	var subject, body string
	switch action {
	case ActionApproved:
		subject = fmt.Sprintf("[%s] Approved – %s to %s",
			instructionID, formatNaira(amountKobo), benefName)
		body = fmt.Sprintf(
			"Your payment request has been fully approved.\n\n"+
				"Instruction: %s\n"+
				"Amount:      %s\n"+
				"Beneficiary: %s\n\n"+
				"View request:\n%s/approvals/%s",
			instructionID, formatNaira(amountKobo), benefName,
			baseURL, requestID,
		)
	case ActionReturned:
		subject = fmt.Sprintf("[%s] Returned – %s to %s",
			instructionID, formatNaira(amountKobo), benefName)
		body = fmt.Sprintf(
			"Your payment request has been returned for revision.\n\n"+
				"Instruction: %s\n"+
				"Amount:      %s\n"+
				"Beneficiary: %s\n"+
				"Reason:      %s\n\n"+
				"View and resubmit:\n%s/approvals/%s",
			instructionID, formatNaira(amountKobo), benefName, notes,
			baseURL, requestID,
		)
	case ActionRejected:
		subject = fmt.Sprintf("[%s] Rejected – %s to %s",
			instructionID, formatNaira(amountKobo), benefName)
		body = fmt.Sprintf(
			"Your payment request has been permanently rejected.\n\n"+
				"Instruction: %s\n"+
				"Amount:      %s\n"+
				"Beneficiary: %s\n"+
				"Reason:      %s\n\n"+
				"View request:\n%s/approvals/%s",
			instructionID, formatNaira(amountKobo), benefName, notes,
			baseURL, requestID,
		)
	}

	return s.notif.Enqueue(ctx, tx, notification.Message{
		EventType:     "payout.step_action",
		TargetAddress: email,
		Subject:       subject,
		BodyText:      body,
	})
}

// ── Public service methods ────────────────────────────────────────────────────

// CreateRequest creates a new payment request in draft status.
func (s *Service) CreateRequest(
	ctx context.Context,
	subsidiaryID uuid.UUID,
	requestType RequestType,
	paymentAccountID uuid.UUID,
	amountKobo int64,
	benefName, benefBank, benefAcct string,
	purpose string,
	raisedBy uuid.UUID,
) (PaymentRequest, error) {
	db := s.st()

	// Verify the payment account exists and is active.
	acct, err := db.getPaymentAccount(ctx, paymentAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrNotFound
		}
		return PaymentRequest{}, err
	}
	if !acct.IsActive {
		return PaymentRequest{}, fmt.Errorf("payout: payment account is inactive")
	}

	return db.createRequest(
		ctx,
		subsidiaryID, string(requestType), paymentAccountID, amountKobo,
		benefName, benefBank, benefAcct, purpose, raisedBy,
	)
}

// SubmitRequest locks a draft request, builds the approval chain, and fires the
// first notification email — all in a single database transaction.
func (s *Service) SubmitRequest(ctx context.Context, requestID, userID uuid.UUID) (PaymentRequest, error) {
	db := s.st()

	// Load the request (outside the tx — read-only guard).
	req, err := db.getRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrNotFound
		}
		return PaymentRequest{}, err
	}
	if req.Status != RequestStatusDraft {
		return PaymentRequest{}, ErrLocked
	}
	if req.RaisedBy != userID {
		return PaymentRequest{}, ErrForbidden
	}

	// ── Item 16: Cut-off time enforcement ────────────────────────────────────
	// Client payments (payouts, liquidations, transfers) cannot be submitted
	// after the bank's same-day cut-off time (WAT = UTC+1).
	if req.RequestType == RequestTypeClientPayout ||
		req.RequestType == RequestTypeLiquidation ||
		req.RequestType == RequestTypeTransfer {
		acct, acctErr := db.getPaymentAccount(ctx, req.PaymentAccountID)
		if acctErr == nil && pastCutOff(acct.CutOffTime) {
			return PaymentRequest{}, fmt.Errorf(
				"payout: the %s cut-off time (%s WAT) has passed; this request will be processed next business day",
				acct.BankName, acct.CutOffTime,
			)
		}
	}

	// Check whether the beneficiary is on the register (sets compliance flag).
	onRegister, err := db.checkBeneficiary(ctx, req.SubsidiaryID, req.BeneficiaryAccount)
	if err != nil {
		return PaymentRequest{}, err
	}
	// If NOT on the register → flag for compliance review.
	complianceFlagged := !onRegister

	// Build the instruction ID.
	year := time.Now().Year()
	code, err := db.getSubsidiaryCode(ctx, req.SubsidiaryID)
	if err != nil {
		return PaymentRequest{}, err
	}
	count, err := db.countRequestsForYear(ctx, req.SubsidiaryID, year)
	if err != nil {
		return PaymentRequest{}, err
	}
	instructionID := fmt.Sprintf("%s-APR-%d-%s", code, year, zeroPad6(count+1))

	// Resolve approvers (outside tx — read-only queries).
	req.ComplianceFlagged = complianceFlagged
	approvers, err := resolveApprovers(ctx, s.pool, req)
	if err != nil {
		return PaymentRequest{}, err
	}
	steps := buildSteps(req, approvers, time.Now())

	// ── Begin transaction ─────────────────────────────────────────────────────
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaymentRequest{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Stamp instruction_id, compliance_flagged, status=submitted.
	if err := db.submitRequest(ctx, tx, requestID, instructionID, complianceFlagged); err != nil {
		return PaymentRequest{}, err
	}

	// Insert steps.
	for _, step := range steps {
		if err := db.createStep(ctx, tx, step); err != nil {
			return PaymentRequest{}, err
		}
	}

	// Advance status to the first non-skipped step's status label.
	firstActiveStatus := RequestStatusSubmitted
	var firstActiveStep *ApprovalStep
	for i := range steps {
		if steps[i].Status == StepStatusPending {
			firstActiveStatus = stepTypeToRequestStatus(steps[i].StepType)
			firstActiveStep = &steps[i]
			break
		}
	}
	if err := db.updateRequestStatus(ctx, tx, requestID, string(firstActiveStatus)); err != nil {
		return PaymentRequest{}, err
	}

	// Log the submission action.
	if err := db.logAction(ctx, tx, ActionLog{
		ID:          uuid.New(),
		RequestID:   requestID,
		ActorUserID: userID,
		Action:      ActionSubmitted,
		Notes:       "",
		Source:      "web",
	}); err != nil {
		return PaymentRequest{}, err
	}

	// Notify the first active step assignee.
	if firstActiveStep != nil {
		if err := s.enqueueStepEmail(
			ctx, tx, requestID, instructionID,
			req.AmountKobo, req.BeneficiaryName,
			firstActiveStep.StepType, firstActiveStep.AssignedTo,
		); err != nil {
			return PaymentRequest{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return PaymentRequest{}, err
	}

	return db.getRequest(ctx, requestID)
}

// GetRequest returns the full detail view: request + steps + audit log.
func (s *Service) GetRequest(ctx context.Context, id uuid.UUID) (RequestDetail, error) {
	db := s.st()

	req, err := db.getRequest(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RequestDetail{}, ErrNotFound
		}
		return RequestDetail{}, err
	}

	steps, err := db.getStepsForRequest(ctx, id)
	if err != nil {
		return RequestDetail{}, err
	}

	log, err := db.getActionLog(ctx, id)
	if err != nil {
		return RequestDetail{}, err
	}

	return RequestDetail{Request: req, Steps: steps, Log: log}, nil
}

// ListRequests returns payment requests with optional filters.
func (s *Service) ListRequests(
	ctx context.Context,
	subsidiaryID uuid.UUID,
	status string,
	mine bool,
	userID uuid.UUID,
) ([]PaymentRequest, error) {
	return s.st().listRequests(ctx, subsidiaryID, status, mine, userID)
}

// GetPendingForUser returns all approval steps currently assigned to userID.
func (s *Service) GetPendingForUser(ctx context.Context, userID uuid.UUID) ([]ApprovalStep, error) {
	return s.st().getPendingStepsForUser(ctx, userID)
}

// ActOnStep processes an approve / return / reject action on the active step of
// a payment request.
func (s *Service) ActOnStep(
	ctx context.Context,
	requestID, userID uuid.UUID,
	action, notes string,
) (PaymentRequest, error) {
	db := s.st()

	req, err := db.getRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrNotFound
		}
		return PaymentRequest{}, err
	}

	activeStep, err := db.getActiveStep(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrAlreadyActed
		}
		return PaymentRequest{}, err
	}

	// Guard: only the assigned approver may act.
	if activeStep.AssignedTo != userID {
		return PaymentRequest{}, ErrNotYourStep
	}
	// Guard: cannot approve your own request.
	if action == "approve" && req.RaisedBy == userID {
		return PaymentRequest{}, ErrForbidden
	}

	// Map action string to step status and action type.
	var stepStatus StepStatus
	var logAction ActionType
	switch action {
	case "approve":
		stepStatus = StepStatusApproved
		logAction = ActionApproved
	case "return":
		stepStatus = StepStatusReturned
		logAction = ActionReturned
	case "reject":
		stepStatus = StepStatusRejected
		logAction = ActionRejected
	default:
		return PaymentRequest{}, fmt.Errorf("payout: unknown action %q", action)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaymentRequest{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Mark the step decided.
	if err := db.advanceStep(ctx, tx, activeStep.ID, string(stepStatus), userID, notes); err != nil {
		return PaymentRequest{}, err
	}

	// Log the action.
	stepIDPtr := &activeStep.ID
	if err := db.logAction(ctx, tx, ActionLog{
		ID:          uuid.New(),
		RequestID:   requestID,
		StepID:      stepIDPtr,
		ActorUserID: userID,
		Action:      logAction,
		Notes:       notes,
		Source:      "web",
	}); err != nil {
		return PaymentRequest{}, err
	}

	switch action {
	case "return":
		if err := db.updateRequestStatus(ctx, tx, requestID, string(RequestStatusReturned)); err != nil {
			return PaymentRequest{}, err
		}
		// Notify the raiser.
		if err := s.enqueueRaiserEmail(
			ctx, tx, requestID, req.InstructionID,
			req.AmountKobo, req.BeneficiaryName,
			req.RaisedBy, ActionReturned, notes,
		); err != nil {
			return PaymentRequest{}, err
		}

	case "reject":
		if err := db.updateRequestStatus(ctx, tx, requestID, string(RequestStatusRejected)); err != nil {
			return PaymentRequest{}, err
		}
		if err := s.enqueueRaiserEmail(
			ctx, tx, requestID, req.InstructionID,
			req.AmountKobo, req.BeneficiaryName,
			req.RaisedBy, ActionRejected, notes,
		); err != nil {
			return PaymentRequest{}, err
		}

	case "approve":
		// Find the next pending step (re-query outside tx to see the just-updated row).
		// Use the pool directly (read-only) — we only need to peek at the next pending step.
		allSteps, err := db.getStepsForRequest(ctx, requestID)
		if err != nil {
			return PaymentRequest{}, err
		}

		var nextStep *ApprovalStep
		for i := range allSteps {
			if allSteps[i].StepOrder > activeStep.StepOrder && allSteps[i].Status == StepStatusPending {
				nextStep = &allSteps[i]
				break
			}
		}

		if nextStep == nil {
			// All steps done — request is approved.
			if err := db.updateRequestStatus(ctx, tx, requestID, string(RequestStatusApproved)); err != nil {
				return PaymentRequest{}, err
			}
			// Set approved_at by re-stamping (the status update already touches updated_at;
			// approved_at must be set separately if the schema tracks it).
			const qApproved = `
				UPDATE payout.payment_request
				SET approved_at = now(), updated_at = now()
				WHERE id = $1
			`
			if _, err := tx.Exec(ctx, qApproved, requestID); err != nil {
				return PaymentRequest{}, err
			}
			if err := s.enqueueRaiserEmail(
				ctx, tx, requestID, req.InstructionID,
				req.AmountKobo, req.BeneficiaryName,
				req.RaisedBy, ActionApproved, "",
			); err != nil {
				return PaymentRequest{}, err
			}
		} else {
			// Advance request to the next step's status.
			nextStatus := stepTypeToRequestStatus(nextStep.StepType)
			if err := db.updateRequestStatus(ctx, tx, requestID, string(nextStatus)); err != nil {
				return PaymentRequest{}, err
			}
			// Notify next assignee.
			if err := s.enqueueStepEmail(
				ctx, tx, requestID, req.InstructionID,
				req.AmountKobo, req.BeneficiaryName,
				nextStep.StepType, nextStep.AssignedTo,
			); err != nil {
				return PaymentRequest{}, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return PaymentRequest{}, err
	}

	return db.getRequest(ctx, requestID)
}

// DispatchRequest marks a fully-approved request as sent to bank.
func (s *Service) DispatchRequest(ctx context.Context, requestID, userID uuid.UUID, bankRef string) (PaymentRequest, error) {
	db := s.st()

	req, err := db.getRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrNotFound
		}
		return PaymentRequest{}, err
	}
	if req.Status != RequestStatusApproved {
		return PaymentRequest{}, ErrLocked
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaymentRequest{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := db.updateBankReference(ctx, tx, requestID, bankRef); err != nil {
		return PaymentRequest{}, err
	}
	if err := db.logAction(ctx, tx, ActionLog{
		ID:          uuid.New(),
		RequestID:   requestID,
		ActorUserID: userID,
		Action:      ActionDispatched,
		Notes:       bankRef,
		Source:      "web",
	}); err != nil {
		return PaymentRequest{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return PaymentRequest{}, err
	}

	return db.getRequest(ctx, requestID)
}

// ConfirmRequest attaches a bank confirmation document and marks the request confirmed.
func (s *Service) ConfirmRequest(ctx context.Context, requestID, userID uuid.UUID, docPath string) (PaymentRequest, error) {
	db := s.st()

	req, err := db.getRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaymentRequest{}, ErrNotFound
		}
		return PaymentRequest{}, err
	}
	if req.Status != RequestStatusSentToBank {
		return PaymentRequest{}, ErrLocked
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaymentRequest{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := db.updateConfirmation(ctx, tx, requestID, docPath); err != nil {
		return PaymentRequest{}, err
	}
	if err := db.logAction(ctx, tx, ActionLog{
		ID:          uuid.New(),
		RequestID:   requestID,
		ActorUserID: userID,
		Action:      ActionConfirmed,
		Notes:       docPath,
		Source:      "web",
	}); err != nil {
		return PaymentRequest{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return PaymentRequest{}, err
	}

	return db.getRequest(ctx, requestID)
}

// ListBeneficiaries returns active client beneficiaries for a subsidiary.
func (s *Service) ListBeneficiaries(ctx context.Context, subsidiaryID uuid.UUID) ([]ClientBeneficiary, error) {
	return s.st().listBeneficiaries(ctx, subsidiaryID)
}

// CheckBeneficiary reports whether an account number is on the beneficiary register.
func (s *Service) CheckBeneficiary(ctx context.Context, subsidiaryID uuid.UUID, accountNumber string) (bool, error) {
	return s.st().checkBeneficiary(ctx, subsidiaryID, accountNumber)
}

// ListPaymentAccounts returns active payment accounts for a subsidiary.
func (s *Service) ListPaymentAccounts(ctx context.Context, subsidiaryID uuid.UUID) ([]PaymentAccount, error) {
	return s.st().listPaymentAccounts(ctx, subsidiaryID)
}

// GetLetter loads the payment request and its payment account, then returns
// a print-optimised HTML bank instruction letter.
func (s *Service) GetLetter(ctx context.Context, id uuid.UUID) (string, error) {
	db := s.st()

	req, err := db.getRequest(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}

	acct, err := db.getPaymentAccount(ctx, req.PaymentAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}

	return GenerateLetter(req, acct), nil
}

// ── Item 16 helper ────────────────────────────────────────────────────────────

// pastCutOff reports whether the current time (in WAT, UTC+1) is past the
// configured cut-off time for same-day bank processing.
// cutOffTime is formatted as "HH:MM", e.g. "15:30".
func pastCutOff(cutOffTime string) bool {
	wat := time.FixedZone("WAT", 1*60*60)
	now := time.Now().In(wat)
	var h, m int
	if _, err := fmt.Sscanf(cutOffTime, "%d:%d", &h, &m); err != nil {
		return false // malformed — don't block on bad config
	}
	cutOff := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, wat)
	return now.After(cutOff)
}

// ── Item 12: email-reply action ───────────────────────────────────────────────

// ActOnStepByEmail is called by the IMAP email poller when a user replies
// APPROVE or REJECT to an approval notification email.
// senderEmail is the From address of the reply; it must match the email of the
// user currently assigned to the active step.
func (s *Service) ActOnStepByEmail(ctx context.Context, requestID uuid.UUID, senderEmail, action, notes string) error {
	db := s.st()

	// Resolve sender email → user ID.
	senderEmail = strings.ToLower(strings.TrimSpace(senderEmail))
	var actorID uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM identity.users WHERE lower(email) = $1 LIMIT 1`, senderEmail,
	).Scan(&actorID)
	if err != nil {
		return fmt.Errorf("payout: email reply from unknown user %q", senderEmail)
	}

	// Load active step.
	step, err := db.getActiveStep(ctx, requestID)
	if err != nil {
		return fmt.Errorf("payout: no active step for request %s", requestID)
	}

	// Verify the sender is the assigned approver.
	if step.AssignedTo != actorID {
		return fmt.Errorf("payout: %s is not the assigned approver for this step", senderEmail)
	}

	_, err = s.ActOnStep(ctx, requestID, actorID, action, notes)
	if err != nil {
		return fmt.Errorf("payout: ActOnStep via email: %w", err)
	}
	return nil
}

// ── Item 15: reconciliation auto-close (called from scheduler) ───────────────

// CloseByReconciliation is called when the bank statement reconciliation finds
// a transaction whose narration or reference contains a payout instruction ID.
// It advances the request from sent_to_bank → confirmed and logs the source.
func (s *Service) CloseByReconciliation(ctx context.Context, instructionID, bankRef string) error {
	db := s.st()

	// Find the request by instruction ID.
	var requestID uuid.UUID
	var status string
	err := s.pool.QueryRow(ctx,
		`SELECT id, status FROM payout.payment_request WHERE instruction_id = $1`, instructionID,
	).Scan(&requestID, &status)
	if err != nil {
		return nil // not found — normal for non-payout bank lines
	}
	if status != string(RequestStatusSentToBank) {
		return nil // already confirmed or in a different state
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	store := db
	if err := store.updateBankReference(ctx, tx, requestID, bankRef); err != nil {
		return err
	}
	if err := store.updateConfirmation(ctx, tx, requestID, ""); err != nil {
		return err
	}
	if err := store.updateRequestStatus(ctx, tx, requestID, string(RequestStatusConfirmed)); err != nil {
		return err
	}
	if err := store.logAction(ctx, tx, ActionLog{
		ID:          uuid.New(),
		RequestID:   requestID,
		ActorUserID: uuid.Nil, // system action
		Action:      ActionConfirmed,
		Notes:       "Auto-confirmed by reconciliation: bank reference " + bankRef,
		Source:      "scheduler",
	}); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
