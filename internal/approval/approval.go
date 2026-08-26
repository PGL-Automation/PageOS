// Package approval is the lean shared approval core. It routes any resource
// through an ordered list of position-resolved steps, records decisions, and
// fires terminal events that owning modules subscribe to.
// Deliberately deferred: delegation, escalation, SLA, quorum voting.
// See docs/onboarding-slice-plan.md §8.
package approval

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/approval/store"
	approvaldb "github.com/pagegroup/pageos/internal/approval/store/gen"
	"github.com/pagegroup/pageos/internal/audit"
	"github.com/pagegroup/pageos/internal/notification"
)

// ── Domain types ──────────────────────────────────────────────────────────────

// Request is a pending or completed approval request for any resource.
type Request struct {
	ID           uuid.UUID      `json:"id"`
	ResourceType string         `json:"resource_type"`
	ResourceID   uuid.UUID      `json:"resource_id"`
	RoutingKey   string         `json:"routing_key"`
	Context      map[string]any `json:"context,omitempty"`
	Status       string         `json:"status"`
	CreatedBy    uuid.UUID      `json:"created_by"`
}

// Step is one node in the ordered approval chain.
type Step struct {
	ID         uuid.UUID  `json:"id"`
	RequestID  uuid.UUID  `json:"request_id"`
	StepOrder  int32      `json:"step_order"`
	PositionID uuid.UUID  `json:"position_id"`
	Label      string     `json:"label"`
	Status     string     `json:"status"` // pending | approved | rejected | returned | skipped
	DecidedBy  *uuid.UUID `json:"decided_by,omitempty"`
	Notes      string     `json:"notes,omitempty"`
}

// RequestDetails is the full view: request + all steps.
type RequestDetails struct {
	Request Request `json:"request"`
	Steps   []Step  `json:"steps"`
}

// StepSpec is the input for one step when creating a request.
type StepSpec struct {
	Order      int32
	PositionID uuid.UUID
	Label      string
	Skip       bool // true = create step with status='skipped'
}

// CreateRequestInput is the input to CreateRequest.
type CreateRequestInput struct {
	ResourceType string
	ResourceID   uuid.UUID
	RoutingKey   string
	Context      map[string]any
	CreatedBy    uuid.UUID
	Steps        []StepSpec
}

// Action is a decision an approver can take on a step.
type Action string

const (
	ActionApprove Action = "approve"
	ActionReject  Action = "reject"
	ActionReturn  Action = "return"
)

// TerminalEvent is emitted when a request reaches a terminal state.
type TerminalEvent struct {
	RequestID    uuid.UUID
	ResourceType string
	ResourceID   uuid.UUID
	Outcome      string // "approved" | "rejected" | "returned"
	Notes        string
}

// TerminalHandler is called after every terminal decision.
type TerminalHandler func(ctx context.Context, e TerminalEvent) error

// OrgPositionResolver lets the approval service check positions without
// importing the organization package (avoids import cycles).
type OrgPositionResolver interface {
	GetActivePositionsForUser(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
}

// QueueItem is one pending step in an approver's queue.
type QueueItem struct {
	Step         Step           `json:"step"`
	ResourceType string         `json:"resource_type"`
	ResourceID   uuid.UUID      `json:"resource_id"`
	Context      map[string]any `json:"context,omitempty"`
}

// ── Service ───────────────────────────────────────────────────────────────────

var ErrUnauthorized = errors.New("approval: actor does not hold the required position")
var ErrStepNotPending = errors.New("approval: step is not in pending state")

// Service holds the approval capabilities.
type Service struct {
	store    *store.Store
	db       *pgxpool.Pool
	org      OrgPositionResolver
	audit    *audit.Writer
	handlers []TerminalHandler
}

func NewService(db *pgxpool.Pool, org OrgPositionResolver, a *audit.Writer) *Service {
	return &Service{store: store.New(db), db: db, org: org, audit: a}
}

// OnTerminalEvent registers a callback invoked when any request reaches a
// terminal state (approved / rejected / returned). Errors are logged, not fatal.
func (s *Service) OnTerminalEvent(h TerminalHandler) {
	s.handlers = append(s.handlers, h)
}

// CreateRequest opens a new approval request and materialises its ordered
// steps in a single operation.
func (s *Service) CreateRequest(ctx context.Context, in CreateRequestInput) (Request, error) {
	ctxJSON := []byte("{}")
	if in.Context != nil {
		ctxJSON, _ = json.Marshal(in.Context)
	}

	row, err := s.store.CreateApprovalRequest(ctx, approvaldb.CreateApprovalRequestParams{
		ResourceType: in.ResourceType,
		ResourceID:   in.ResourceID,
		RoutingKey:   in.RoutingKey,
		Context:      ctxJSON,
		CreatedBy:    in.CreatedBy,
	})
	if err != nil {
		return Request{}, fmt.Errorf("approval: create request: %w", err)
	}

	req := toRequest(row)

	for _, spec := range in.Steps {
		status := "pending"
		if spec.Skip {
			status = "skipped"
		}
		if _, err := s.store.CreateApprovalStep(ctx, approvaldb.CreateApprovalStepParams{
			RequestID:  req.ID,
			StepOrder:  spec.Order,
			PositionID: spec.PositionID,
			Label:      spec.Label,
			Status:     status,
		}); err != nil {
			return Request{}, fmt.Errorf("approval: create step %d: %w", spec.Order, err)
		}
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "approval.request.created",
		ResourceType: in.ResourceType, ResourceID: in.ResourceID.String(),
		Context: map[string]any{"request_id": req.ID.String(), "routing_key": in.RoutingKey},
	})

	// Notify the holders of the first pending step's position.
	label := resourceLabel(in.ResourceType)
	for _, spec := range in.Steps {
		if !spec.Skip {
			resID := in.ResourceID
			_ = notification.SendToPosition(ctx, s.db, spec.PositionID,
				notification.InApp{
					Type:       "approval_requested",
					Title:      "Approval Required: " + label,
					Body:       label + " has been submitted and requires your approval.",
					Link:       "/approval",
					Priority:   "urgent",
					EntityType: in.ResourceType,
					EntityID:   &resID,
				})
			break // only notify step-1 holders initially; advance-step notification deferred
		}
	}
	return req, nil
}

// GetRequest returns the full request + steps.
func (s *Service) GetRequest(ctx context.Context, requestID uuid.UUID) (RequestDetails, error) {
	row, err := s.store.GetApprovalRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RequestDetails{}, fmt.Errorf("approval: request not found")
		}
		return RequestDetails{}, err
	}
	steps, err := s.store.ListApprovalSteps(ctx, requestID)
	if err != nil {
		return RequestDetails{}, err
	}
	out := RequestDetails{Request: toRequest(row)}
	for _, st := range steps {
		out.Steps = append(out.Steps, toStep(st))
	}
	return out, nil
}

// GetRequestForResource returns the most recent approval request for a resource.
func (s *Service) GetRequestForResource(ctx context.Context, resourceType string, resourceID uuid.UUID) (RequestDetails, error) {
	row, err := s.store.GetApprovalRequestForResource(ctx, approvaldb.GetApprovalRequestForResourceParams{
		ResourceType: resourceType,
		ResourceID:   resourceID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RequestDetails{}, fmt.Errorf("approval: no request found for resource")
		}
		return RequestDetails{}, err
	}
	return s.GetRequest(ctx, row.ID)
}

// GetQueue returns all pending steps the authenticated user can act on,
// based on the positions they currently hold.
func (s *Service) GetQueue(ctx context.Context, userID uuid.UUID) ([]QueueItem, error) {
	positionIDs, err := s.org.GetActivePositionsForUser(ctx, userID)
	if err != nil || len(positionIDs) == 0 {
		return nil, err
	}

	rows, err := s.store.GetPendingStepsForPositions(ctx, positionIDs)
	if err != nil {
		return nil, err
	}

	out := make([]QueueItem, 0, len(rows))
	for _, r := range rows {
		qi := QueueItem{
			Step:         toStep(approvaldb.ApprovalApprovalStep{
				ID: r.ID, RequestID: r.RequestID, StepOrder: r.StepOrder,
				PositionID: r.PositionID, Label: r.Label, Status: r.Status,
				DecidedBy: r.DecidedBy, DecidedAt: r.DecidedAt, Notes: r.Notes,
				CreatedAt: r.CreatedAt,
			}),
			ResourceType: r.ResourceType,
			ResourceID:   r.ResourceID,
		}
		if len(r.RequestContext) > 0 {
			_ = json.Unmarshal(r.RequestContext, &qi.Context)
		}
		out = append(out, qi)
	}
	return out, nil
}

// RecordDecision records an approve/reject/return decision on a pending step.
// It validates the actor holds the step's position, advances the chain if
// approved, and fires a TerminalEvent when the request reaches a terminal state.
func (s *Service) RecordDecision(ctx context.Context, requestID, stepID, actorUserID uuid.UUID, action Action, notes string) error {
	// Validate actor holds the position for this step.
	step, err := s.store.GetApprovalStep(ctx, stepID)
	if err != nil {
		return fmt.Errorf("approval: step not found")
	}
	if step.Status != "pending" {
		return ErrStepNotPending
	}

	positionIDs, err := s.org.GetActivePositionsForUser(ctx, actorUserID)
	if err != nil {
		return err
	}
	if !containsUUID(positionIDs, step.PositionID) {
		return ErrUnauthorized
	}

	// Record the decision on the step.
	newStatus := string(action) + "d" // approve→approved, reject→rejected, return→returned
	if action == ActionReturn {
		newStatus = "returned"
	}
	if _, err := s.store.RecordStepDecision(ctx, approvaldb.RecordStepDecisionParams{
		ID:        stepID,
		Status:    newStatus,
		DecidedBy: &actorUserID,
		Notes:     notes,
	}); err != nil {
		return fmt.Errorf("approval: record decision: %w", err)
	}

	req, err := s.store.GetApprovalRequest(ctx, requestID)
	if err != nil {
		return err
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: actorUserID.String()},
		Action: fmt.Sprintf("approval.step.%s", newStatus),
		ResourceType: req.ResourceType, ResourceID: req.ResourceID.String(),
		Context: map[string]any{"step_id": stepID.String(), "step_order": step.StepOrder},
	})

	// Determine whether this is a terminal outcome.
	switch action {
	case ActionReject:
		return s.finalise(ctx, req, "rejected", notes)
	case ActionReturn:
		return s.finalise(ctx, req, "returned", notes)
	case ActionApprove:
		// Check if there is another pending step.
		next, err := s.store.GetNextPendingStep(ctx, requestID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// No more pending steps — all approved.
				return s.finalise(ctx, req, "approved", "")
			}
			return err
		}
		// There is a next step; mark request in_progress.
		_ = next // next step is already pending, nothing to do except update status
		_, err = s.store.UpdateApprovalRequestStatus(ctx, approvaldb.UpdateApprovalRequestStatusParams{
			ID: requestID, Status: "in_progress",
		})
		return err
	}
	return nil
}

// finalise sets the request status and fires all terminal handlers.
func (s *Service) finalise(ctx context.Context, req approvaldb.ApprovalApprovalRequest, outcome, notes string) error {
	if _, err := s.store.UpdateApprovalRequestStatus(ctx, approvaldb.UpdateApprovalRequestStatusParams{
		ID: req.ID, Status: outcome,
	}); err != nil {
		return err
	}
	event := TerminalEvent{
		RequestID:    req.ID,
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		Outcome:      outcome,
		Notes:        notes,
	}
	for _, h := range s.handlers {
		if err := h(ctx, event); err != nil {
			// Handlers should be resilient; log but don't fail the decision.
			_ = s.audit.Write(ctx, audit.Entry{
				Actor: audit.Actor{Type: "system"}, Action: "approval.terminal_handler.error",
				ResourceType: req.ResourceType, ResourceID: req.ResourceID.String(),
				Context: map[string]any{"outcome": outcome, "error": err.Error()},
			})
		}
	}

	// Notify the requester of the final outcome.
	label := resourceLabel(req.ResourceType)
	reqID := req.ResourceID
	switch outcome {
	case "approved":
		_ = notification.SendToUserByID(ctx, s.db, req.CreatedBy, notification.InApp{
			Type:       "approval_approved",
			Title:      label + " Approved",
			Body:       label + " has been approved by all reviewers.",
			Link:       "/approval",
			Priority:   "medium",
			EntityType: req.ResourceType,
			EntityID:   &reqID,
		})
	case "rejected":
		body := label + " has been rejected."
		if notes != "" {
			body = label + " has been rejected: " + notes
		}
		_ = notification.SendToUserByID(ctx, s.db, req.CreatedBy, notification.InApp{
			Type:       "approval_rejected",
			Title:      label + " Rejected",
			Body:       body,
			Link:       "/approval",
			Priority:   "urgent",
			EntityType: req.ResourceType,
			EntityID:   &reqID,
		})
	case "returned":
		_ = notification.SendToUserByID(ctx, s.db, req.CreatedBy, notification.InApp{
			Type:       "approval_returned",
			Title:      label + " Returned for Revision",
			Body:       label + " has been returned for revision. Please review and resubmit.",
			Link:       "/approval",
			Priority:   "high",
			EntityType: req.ResourceType,
			EntityID:   &reqID,
		})
	}
	return nil
}

func resourceLabel(resourceType string) string {
	labels := map[string]string{
		"onboarding_case": "Client Onboarding",
		"journal":         "Journal",
		"payroll":         "Payroll Run",
		"leave_request":   "Leave Request",
	}
	if l, ok := labels[resourceType]; ok {
		return l
	}
	return "Request"
}

// ── type mappings ─────────────────────────────────────────────────────────────

func toRequest(r approvaldb.ApprovalApprovalRequest) Request {
	req := Request{
		ID: r.ID, ResourceType: r.ResourceType, ResourceID: r.ResourceID,
		RoutingKey: r.RoutingKey, Status: r.Status, CreatedBy: r.CreatedBy,
	}
	if len(r.Context) > 0 {
		_ = json.Unmarshal(r.Context, &req.Context)
	}
	return req
}

func toStep(s approvaldb.ApprovalApprovalStep) Step {
	return Step{
		ID: s.ID, RequestID: s.RequestID, StepOrder: s.StepOrder,
		PositionID: s.PositionID, Label: s.Label, Status: s.Status,
		DecidedBy: s.DecidedBy, Notes: s.Notes,
	}
}

func containsUUID(list []uuid.UUID, target uuid.UUID) bool {
	for _, id := range list {
		if id == target {
			return true
		}
	}
	return false
}
