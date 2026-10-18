// Package payout manages payment requests, multi-step approval workflows,
// and bank dispatch for Page Group subsidiaries.
package payout

import (
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/notification"
)

// ── Typed constants ───────────────────────────────────────────────────────────

// RequestType identifies the category of a payment request.
type RequestType string

const (
	RequestTypeClientPayout  RequestType = "client_payout"
	RequestTypeLiquidation   RequestType = "liquidation"
	RequestTypeTransfer      RequestType = "transfer"
	RequestTypeExpense       RequestType = "expense"
	RequestTypePlacement     RequestType = "placement"
)

// StepType identifies the role that must act at a given approval step.
type StepType string

const (
	StepTypeHeadConcur       StepType = "head_concur"
	StepTypeInternalControl  StepType = "internal_control"
	StepTypeCompliance       StepType = "compliance"
	StepTypeFinanceCheck     StepType = "finance_check"
	StepTypeSignatory1       StepType = "signatory_1"
	StepTypeSignatory2       StepType = "signatory_2"
	StepTypeMD               StepType = "md"
	StepTypeCEO              StepType = "ceo"
)

// StepStatus is the lifecycle state of an individual approval step.
type StepStatus string

const (
	StepStatusPending  StepStatus = "pending"
	StepStatusApproved StepStatus = "approved"
	StepStatusReturned StepStatus = "returned"
	StepStatusRejected StepStatus = "rejected"
	StepStatusSkipped  StepStatus = "skipped"
)

// RequestStatus is the overall lifecycle state of a payment request.
type RequestStatus string

const (
	RequestStatusDraft              RequestStatus = "draft"
	RequestStatusSubmitted          RequestStatus = "submitted"
	RequestStatusHeadConcur         RequestStatus = "head_concur"
	RequestStatusInternalControl    RequestStatus = "internal_control"
	RequestStatusCompliance         RequestStatus = "compliance"
	RequestStatusFinanceCheck       RequestStatus = "finance_check"
	RequestStatusPendingSignatories RequestStatus = "pending_signatories"
	RequestStatusApproved           RequestStatus = "approved"
	RequestStatusSentToBank         RequestStatus = "sent_to_bank"
	RequestStatusConfirmed          RequestStatus = "confirmed"
	RequestStatusReconciled         RequestStatus = "reconciled"
	RequestStatusReturned           RequestStatus = "returned"
	RequestStatusRejected           RequestStatus = "rejected"
)

// ActionType labels an entry in the action log.
type ActionType string

const (
	ActionCreated    ActionType = "created"
	ActionSubmitted  ActionType = "submitted"
	ActionApproved   ActionType = "approved"
	ActionReturned   ActionType = "returned"
	ActionRejected   ActionType = "rejected"
	ActionEscalated  ActionType = "escalated"
	ActionDispatched ActionType = "dispatched"
	ActionConfirmed  ActionType = "confirmed"
)

// ── Domain types ──────────────────────────────────────────────────────────────

// PaymentAccount is a subsidiary's source bank account from which payments are made.
type PaymentAccount struct {
	ID             uuid.UUID `json:"id"`
	SubsidiaryID   uuid.UUID `json:"subsidiary_id"`
	BankName       string    `json:"bank_name"`
	AccountName    string    `json:"account_name"`
	AccountNumber  string    `json:"account_number"`
	CutOffTime     string    `json:"cut_off_time"` // "HH:MM" e.g. "15:30"
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
}

// ClientBeneficiary is a pre-registered recipient for client payouts.
type ClientBeneficiary struct {
	ID            uuid.UUID `json:"id"`
	SubsidiaryID  uuid.UUID `json:"subsidiary_id"`
	ClientName    string    `json:"client_name"`
	ClientID      string    `json:"client_id"`
	BankName      string    `json:"bank_name"`
	AccountNumber string    `json:"account_number"`
	AccountName   string    `json:"account_name"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
}

// StandIn maps a user who is absent to the colleague covering their approvals.
type StandIn struct {
	ID          uuid.UUID  `json:"id"`
	UserID      *uuid.UUID `json:"user_id,omitempty"`
	CoverUserID *uuid.UUID `json:"cover_user_id,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// PaymentRequest is the central record for a payout instruction.
type PaymentRequest struct {
	ID                  uuid.UUID     `json:"id"`
	InstructionID       string        `json:"instruction_id"`
	SubsidiaryID        uuid.UUID     `json:"subsidiary_id"`
	RequestType         RequestType   `json:"request_type"`
	PaymentAccountID    uuid.UUID     `json:"payment_account_id"`
	AmountKobo          int64         `json:"amount_kobo"`
	BeneficiaryName     string        `json:"beneficiary_name"`
	BeneficiaryBank     string        `json:"beneficiary_bank"`
	BeneficiaryAccount  string        `json:"beneficiary_account"`
	Purpose             string        `json:"purpose"`
	SupportingDocPath   string        `json:"supporting_doc_path"`
	Status              RequestStatus `json:"status"`
	ComplianceFlagged   bool          `json:"compliance_flagged"`
	RaisedBy            uuid.UUID     `json:"raised_by"`
	SubmittedAt         *time.Time    `json:"submitted_at,omitempty"`
	ApprovedAt          *time.Time    `json:"approved_at,omitempty"`
	BankReference       string        `json:"bank_reference"`
	ConfirmationDocPath string        `json:"confirmation_doc_path"`
	CreatedAt           time.Time     `json:"created_at"`
	UpdatedAt           time.Time     `json:"updated_at"`
}

// ApprovalStep represents one node in the approval chain for a payment request.
type ApprovalStep struct {
	ID          uuid.UUID  `json:"id"`
	RequestID   uuid.UUID  `json:"request_id"`
	StepOrder   int        `json:"step_order"`
	StepType    StepType   `json:"step_type"`
	AssignedTo  uuid.UUID  `json:"assigned_to"`
	StandInFor  *uuid.UUID `json:"stand_in_for,omitempty"`
	Status      StepStatus `json:"status"`
	DueBy       time.Time  `json:"due_by"`
	ReminderSentAt *time.Time `json:"reminder_sent_at,omitempty"`
	EscalatedAt    *time.Time `json:"escalated_at,omitempty"`
	DecidedAt      *time.Time `json:"decided_at,omitempty"`
	Notes       string     `json:"notes"`
	CreatedAt   time.Time  `json:"created_at"`

	// Populated by store queries that join to payment_request (not a DB column).
	RequestInstID    string `json:"request_inst_id,omitempty"`
	// StepLimitMinutes is computed from the step window and used by the scheduler.
	StepLimitMinutes int    `json:"-"`
}

// ActionLog records every significant event on a payment request for audit purposes.
type ActionLog struct {
	ID          uuid.UUID  `json:"id"`
	RequestID   uuid.UUID  `json:"request_id"`
	StepID      *uuid.UUID `json:"step_id,omitempty"`
	ActorUserID uuid.UUID  `json:"actor_user_id"`
	Action      ActionType `json:"action"`
	Notes       string     `json:"notes"`
	Source      string     `json:"source"`
	CreatedAt   time.Time  `json:"created_at"`
}

// RequestDetail is the full view returned by GET /:id — request + steps + log.
type RequestDetail struct {
	Request PaymentRequest `json:"request"`
	Steps   []ApprovalStep `json:"steps"`
	Log     []ActionLog    `json:"log"`
}

// ── Sentinel errors ───────────────────────────────────────────────────────────

var (
	// ErrNotFound is returned when a requested resource does not exist.
	ErrNotFound = errors.New("payout: not found")

	// ErrForbidden is returned when the caller lacks permission for the operation.
	ErrForbidden = errors.New("payout: forbidden")

	// ErrAlreadyActed is returned when a step has already been decided.
	ErrAlreadyActed = errors.New("payout: step already acted on")

	// ErrLocked is returned when a request is in a state that does not allow mutation.
	ErrLocked = errors.New("payout: request is locked")

	// ErrNotYourStep is returned when the caller is not assigned to the active step.
	ErrNotYourStep = errors.New("payout: not your step to act on")
)

// ── Service ───────────────────────────────────────────────────────────────────

// Service provides all payout domain operations.
type Service struct {
	pool   *pgxpool.Pool
	notif  *notification.Outbox
	logger *slog.Logger
}

// NewService constructs a Service backed by the given connection pool.
func NewService(pool *pgxpool.Pool, logger *slog.Logger) *Service {
	return &Service{
		pool:   pool,
		notif:  notification.Shared(),
		logger: logger,
	}
}
