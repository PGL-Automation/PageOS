// Package onboarding is the M2 domain: clients, cases, application data,
// KYC document slots, and RM–client assignments.
package onboarding

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/approval"
	"github.com/pagegroup/pageos/internal/audit"
	"github.com/pagegroup/pageos/internal/onboarding/domain"
	"github.com/pagegroup/pageos/internal/notification"
	onboardingdb "github.com/pagegroup/pageos/internal/onboarding/store/gen"
	"github.com/pagegroup/pageos/internal/onboarding/store"
)

// ApprovalCreator is the subset of approval.Service used by onboarding.
// Defined as an interface to avoid import cycles.
type ApprovalCreator interface {
	CreateRequest(ctx context.Context, in approval.CreateRequestInput) (approval.Request, error)
}

// OrgPositionLookup is the subset of organization.Service used by onboarding
// for resolving approval routing positions. The method signature matches
// organization.Service.GetPositionByCode exactly.
type OrgPositionLookup interface {
	GetPositionByCode(ctx context.Context, subsidiaryID uuid.UUID, code string) (OrgPosition, error)
}

// OrgPosition mirrors organization.Position to avoid an import cycle.
type OrgPosition struct {
	ID    uuid.UUID
	Code  string
	Title string
}

var (
	ErrCaseNotFound      = errors.New("onboarding: case not found")
	ErrNotDraft          = errors.New("onboarding: case is not in draft state")
	ErrRequirementsUnmet = errors.New("onboarding: required documents or consents are missing")
)

// Service holds all onboarding capabilities.
type Service struct {
	store       *store.Store
	audit       *audit.Writer
	approvalSvc ApprovalCreator    // nil until wired at startup
	orgSvc      OrgPositionLookup  // nil until wired at startup
}

func NewService(db *pgxpool.Pool, a *audit.Writer) *Service {
	return &Service{store: store.New(db), audit: a}
}

// SetApprovalService wires the approval service after construction (avoids
// circular constructor deps between onboarding ↔ approval).
func (s *Service) SetApprovalService(svc ApprovalCreator) { s.approvalSvc = svc }

// SetOrgService wires the org service for routing position lookups.
func (s *Service) SetOrgService(svc OrgPositionLookup) { s.orgSvc = svc }

// ── Clients ──────────────────────────────────────────────────────────────────

func (s *Service) CreateClient(ctx context.Context, subsidiaryID uuid.UUID, clientType, displayName string, brokerID *uuid.UUID) (domain.Client, error) {
	if displayName == "" {
		return domain.Client{}, fmt.Errorf("onboarding: display_name is required")
	}
	row, err := s.store.CreateClient(ctx, onboardingdb.CreateClientParams{
		SubsidiaryID: subsidiaryID,
		ClientType:   clientType,
		DisplayName:  displayName,
		BrokerID:     brokerID,
	})
	if err != nil {
		return domain.Client{}, fmt.Errorf("onboarding: create client: %w", err)
	}
	c := toClient(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "onboarding.client.created",
		ResourceType: "client", ResourceID: c.ID.String(),
	})
	return c, nil
}

func (s *Service) GetClient(ctx context.Context, id uuid.UUID) (domain.Client, error) {
	row, err := s.store.GetClient(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Client{}, fmt.Errorf("onboarding: client not found")
		}
		return domain.Client{}, err
	}
	return toClient(row), nil
}

func (s *Service) ListClients(ctx context.Context, subsidiaryID uuid.UUID) ([]domain.Client, error) {
	rows, err := s.store.ListClients(ctx, subsidiaryID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Client, 0, len(rows))
	for _, r := range rows {
		out = append(out, toClient(r))
	}
	return out, nil
}

// ListAllClients returns clients across ALL subsidiaries, optionally filtered by status.
// Used by Finance / Operations roles who need to see approved clients without
// being restricted to a single subsidiary.
//
// When status = "active", it returns clients whose status IS active OR whose
// most recent onboarding case is in state "approved" — this handles cases where
// UpdateClientStatus may have failed silently on an older approval.
func (s *Service) ListAllClients(ctx context.Context, status string) ([]domain.Client, error) {
	const q = `
		SELECT DISTINCT ON (c.id)
		       c.id, c.subsidiary_id, c.client_type, c.display_name, c.status, c.broker_id
		FROM   onboarding.client c
		LEFT   JOIN onboarding.onboarding_case oc ON oc.client_id = c.id
		WHERE  ($1::text = ''
		        OR c.status = $1
		        OR ($1 = 'active' AND oc.state = 'approved'))
		ORDER  BY c.id, c.created_at DESC
	`
	rows, err := s.store.Pool().Query(ctx, q, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Client
	for rows.Next() {
		var c domain.Client
		if err := rows.Scan(&c.ID, &c.SubsidiaryID, &c.ClientType, &c.DisplayName, &c.Status, &c.BrokerID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Cases ────────────────────────────────────────────────────────────────────

// CreateCase opens a new onboarding case and materialises the requirement
// instances for the client's type and current requirement set version.
func (s *Service) CreateCase(ctx context.Context, clientID, initiatorID uuid.UUID) (domain.OnboardingCase, error) {
	client, err := s.GetClient(ctx, clientID)
	if err != nil {
		return domain.OnboardingCase{}, err
	}

	reqSet := domain.GetRequirementSet(client.ClientType, 1)

	row, err := s.store.CreateCase(ctx, onboardingdb.CreateCaseParams{
		ClientID:              clientID,
		SubsidiaryID:          client.SubsidiaryID,
		ClientType:            client.ClientType,
		RequirementSetVersion: int32(reqSet.Version),
		InitiatedBy:           initiatorID,
	})
	if err != nil {
		return domain.OnboardingCase{}, fmt.Errorf("onboarding: create case: %w", err)
	}

	c := toCase(row)

	// Materialise requirement instances with empty ApplicationFields (no data yet).
	if err := s.materialiseRequirements(ctx, c.ID, reqSet, domain.ApplicationFields{}); err != nil {
		return domain.OnboardingCase{}, fmt.Errorf("onboarding: materialise requirements: %w", err)
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: initiatorID.String()},
		Action: "onboarding.case.created",
		ResourceType: "onboarding_case", ResourceID: c.ID.String(),
		Context: map[string]any{"client_id": clientID.String(), "client_type": client.ClientType},
	})
	return c, nil
}

// GetCaseDetails returns the case, its application data, and requirement status.
func (s *Service) GetCaseDetails(ctx context.Context, caseID uuid.UUID) (domain.CaseDetails, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.CaseDetails{}, ErrCaseNotFound
		}
		return domain.CaseDetails{}, err
	}
	c := toCase(caseRow)

	details := domain.CaseDetails{Case: c}

	// Application data (may not exist yet if just created)
	appRow, err := s.store.GetApplicationData(ctx, caseID)
	if err == nil {
		app := toApplicationData(appRow)
		details.Application = &app
	}

	// Requirement instances
	reqRows, err := s.store.ListRequirementInstances(ctx, caseID)
	if err != nil {
		return domain.CaseDetails{}, err
	}
	reqs := make([]domain.RequirementInstance, 0, len(reqRows))
	for _, r := range reqRows {
		reqs = append(reqs, toRequirementInstance(r))
	}
	details.Requirements = reqs
	details.CanSubmit = c.State == "draft" && allRequiredSatisfied(reqs)

	return details, nil
}

// ListCases returns all cases for a subsidiary, optionally filtered by state.
func (s *Service) ListCases(ctx context.Context, subsidiaryID *uuid.UUID, state string) ([]domain.OnboardingCase, error) {
	// When subsidiaryID is nil (group-level compliance view), use a raw query
	// so we can return cases across all subsidiaries.
	if subsidiaryID == nil {
		return s.listAllCases(ctx, state)
	}
	var rows []onboardingdb.OnboardingOnboardingCase
	var err error
	if state == "" {
		rows, err = s.store.ListAllCasesBySubsidiary(ctx, *subsidiaryID)
	} else {
		rows, err = s.store.ListCasesBySubsidiary(ctx, onboardingdb.ListCasesBySubsidiaryParams{
			SubsidiaryID: *subsidiaryID,
			State:        state,
		})
	}
	if err != nil {
		return nil, err
	}
	out := make([]domain.OnboardingCase, 0, len(rows))
	for _, r := range rows {
		out = append(out, toCase(r))
	}
	return out, nil
}

// listAllCases returns cases across all subsidiaries, optionally filtered by state.
// Used by group-level compliance officers who span the entire organisation.
func (s *Service) listAllCases(ctx context.Context, state string) ([]domain.OnboardingCase, error) {
	var q string
	var args []interface{}
	if state == "" {
		q = `SELECT id, client_id, subsidiary_id, client_type, requirement_set_version,
		            state, risk_flag, risk_notes, return_count, return_notes,
		            initiated_by, tnc_version, tnc_accepted_at, submitted_at, created_at, updated_at
		     FROM onboarding.onboarding_case ORDER BY created_at DESC`
	} else {
		q = `SELECT id, client_id, subsidiary_id, client_type, requirement_set_version,
		            state, risk_flag, risk_notes, return_count, return_notes,
		            initiated_by, tnc_version, tnc_accepted_at, submitted_at, created_at, updated_at
		     FROM onboarding.onboarding_case WHERE state = $1 ORDER BY risk_flag DESC, created_at ASC`
		args = []interface{}{state}
	}
	pool := s.store.Pool()
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("onboarding: list all cases: %w", err)
	}
	defer rows.Close()
	var out []domain.OnboardingCase
	for rows.Next() {
		var r onboardingdb.OnboardingOnboardingCase
		if err := rows.Scan(
			&r.ID, &r.ClientID, &r.SubsidiaryID, &r.ClientType, &r.RequirementSetVersion,
			&r.State, &r.RiskFlag, &r.RiskNotes, &r.ReturnCount, &r.ReturnNotes,
			&r.InitiatedBy, &r.TncVersion, &r.TncAcceptedAt, &r.SubmittedAt, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("onboarding: scan case: %w", err)
		}
		out = append(out, toCase(r))
	}
	return out, rows.Err()
}

// SaveApplicationData upserts the application form fields for a case, then
// re-evaluates which requirement instances apply and whether each is satisfied.
func (s *Service) SaveApplicationData(ctx context.Context, caseID uuid.UUID, data domain.ApplicationData) (domain.ApplicationData, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		return domain.ApplicationData{}, ErrCaseNotFound
	}
	if caseRow.State != "draft" {
		return domain.ApplicationData{}, ErrNotDraft
	}

	dob := pgtype.Date{}
	if data.DateOfBirth != nil {
		dob = pgtype.Date{Time: *data.DateOfBirth, Valid: true}
	}

	socialJSON := []byte("{}")
	if data.SocialMedia != nil {
		socialJSON, _ = json.Marshal(data.SocialMedia)
	}

	if data.PhoneNumbers == nil {
		data.PhoneNumbers = []string{}
	}

	appRow, err := s.store.UpsertApplicationData(ctx, onboardingdb.UpsertApplicationDataParams{
		CaseID: caseID, FullName: data.FullName, Gender: data.Gender,
		MothersMaidenName: data.MothersMaidenName, DateOfBirth: dob,
		PlaceOfBirth: data.PlaceOfBirth, CountryOfOrigin: data.CountryOfOrigin,
		PlaceOfResidence: data.PlaceOfResidence, ResidentialAddress: data.ResidentialAddress,
		IsUsPerson: data.IsUSPerson, UsAddress: data.USAddress,
		PhoneNumbers: data.PhoneNumbers, Email: data.Email, Tin: data.TIN,
		NextOfKinName: data.NextOfKinName, NextOfKinEmail: data.NextOfKinEmail,
		NextOfKinPhone: data.NextOfKinPhone, Employer: data.Employer,
		EmployerAddress: data.EmployerAddress, OfficialEmail: data.OfficialEmail,
		OfficialPhone: data.OfficialPhone, IsPep: data.IsPEP,
		PepPosition: data.PEPPosition, PepPeriod: data.PEPPeriod,
		SocialMedia: socialJSON, SourceOfFunds: data.SourceOfFunds,
		SourceOfWealth: data.SourceOfWealth, InvestmentPurpose: data.InvestmentPurpose,
		InvestmentAmountKobo: data.InvestmentAmountKobo, InvestmentAmountWords: data.InvestmentAmountWords,
		Tenor: data.Tenor, InterestRateBps: data.InterestRateBps,
		BankName: data.BankName, BankAccountName: data.BankAccountName,
		BankAccountNumber: data.BankAccountNumber, Bvn: data.BVN, SortCode: data.SortCode,
		DeclarationLegalCapacity: data.DeclarationLegalCapacity,
		DeclarationInfoCorrect:   data.DeclarationInfoCorrect,
		DeclarationTncAccepted:   data.DeclarationTNCAccepted,
		DeclarationMinHolding:    data.DeclarationMinHolding,
	})
	if err != nil {
		return domain.ApplicationData{}, fmt.Errorf("onboarding: save application data: %w", err)
	}

	saved := toApplicationData(appRow)

	// Re-evaluate requirements in light of new field values.
	reqSet := domain.GetRequirementSet(caseRow.ClientType, int(caseRow.RequirementSetVersion))
	fields := saved.ToApplicationFields()
	if err := s.materialiseRequirements(ctx, caseID, reqSet, fields); err != nil {
		return saved, fmt.Errorf("onboarding: re-evaluate requirements: %w", err)
	}

	// Propagate PEP flag to case risk_flag.
	if data.IsPEP {
		_ = s.store.SetCaseRiskFlag(ctx, onboardingdb.SetCaseRiskFlagParams{
			ID: caseID, RiskFlag: true, RiskNotes: "PEP declared in application",
		})
	}

	return saved, nil
}

// AttachDocument links an uploaded document to a requirement slot and marks
// it satisfied. The document must already exist in the documents module.
func (s *Service) AttachDocument(ctx context.Context, caseID uuid.UUID, requirementKey string, documentID uuid.UUID) (domain.RequirementInstance, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		return domain.RequirementInstance{}, ErrCaseNotFound
	}
	if caseRow.State != "draft" {
		return domain.RequirementInstance{}, ErrNotDraft
	}

	row, err := s.store.SatisfyRequirementWithDocument(ctx, onboardingdb.SatisfyRequirementWithDocumentParams{
		CaseID:         caseID,
		RequirementKey: requirementKey,
		DocumentID:     &documentID,
	})
	if err != nil {
		return domain.RequirementInstance{}, fmt.Errorf("onboarding: attach document to requirement %q: %w", requirementKey, err)
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "onboarding.requirement.satisfied",
		ResourceType: "onboarding_case", ResourceID: caseID.String(),
		Context: map[string]any{"requirement_key": requirementKey, "document_id": documentID.String()},
	})
	return toRequirementInstance(row), nil
}

// EvaluateRequirements returns the current satisfaction status for all
// requirement instances on a case.
func (s *Service) EvaluateRequirements(ctx context.Context, caseID uuid.UUID) ([]domain.RequirementInstance, error) {
	rows, err := s.store.ListRequirementInstances(ctx, caseID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.RequirementInstance, 0, len(rows))
	for _, r := range rows {
		out = append(out, toRequirementInstance(r))
	}
	return out, nil
}

// SubmitCase validates completeness, transitions to SUBMITTED, creates the
// approval request (WM → MD-if-risk → Compliance), then advances to IN_REVIEW.
func (s *Service) SubmitCase(ctx context.Context, caseID, userID uuid.UUID) (domain.OnboardingCase, error) {
	reqs, err := s.EvaluateRequirements(ctx, caseID)
	if err != nil {
		return domain.OnboardingCase{}, err
	}
	if !allRequiredSatisfied(reqs) {
		return domain.OnboardingCase{}, ErrRequirementsUnmet
	}

	row, err := s.store.SubmitCase(ctx, caseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.OnboardingCase{}, fmt.Errorf("onboarding: case not found or not in draft state")
		}
		return domain.OnboardingCase{}, fmt.Errorf("onboarding: submit case: %w", err)
	}
	c := toCase(row)

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: userID.String()}, Action: "onboarding.case.submitted",
		ResourceType: "onboarding_case", ResourceID: c.ID.String(),
	})

	// Create the approval request if the approval service is wired.
	if s.approvalSvc != nil && s.orgSvc != nil {
		steps, err := s.resolveApprovalSteps(ctx, c)
		if err == nil && len(steps) > 0 {
			ctxMap := map[string]any{
				"subsidiary_id": c.SubsidiaryID.String(),
				"risk_flag":     c.RiskFlag,
				"client_type":   c.ClientType,
			}
			if _, err := s.approvalSvc.CreateRequest(ctx, approval.CreateRequestInput{
				ResourceType: "onboarding_case",
				ResourceID:   caseID,
				RoutingKey:   "onboarding_v1",
				Context:      ctxMap,
				CreatedBy:    userID,
				Steps:        steps,
			}); err == nil {
				// Advance case to IN_REVIEW.
				updated, _ := s.store.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{
					ID: caseID, State: "in_review",
				})
				c = toCase(updated)
			}
		}
	}

	return c, nil
}

// resolveApprovalSteps returns the ordered step specs for an onboarding case.
// Step 1: WEALTH_MANAGER (always)
// Step 2: MANAGING_DIRECTOR (only if risk_flag)
// Step 3: COMPLIANCE_MANAGER (always)
func (s *Service) resolveApprovalSteps(ctx context.Context, c domain.OnboardingCase) ([]approval.StepSpec, error) {
	get := func(code string) (uuid.UUID, error) {
		pos, err := s.orgSvc.GetPositionByCode(ctx, c.SubsidiaryID, code)
		if err != nil {
			return uuid.UUID{}, err
		}
		return pos.ID, nil
	}

	var steps []approval.StepSpec

	wmID, err := get("WEALTH_MANAGER")
	if err != nil {
		return nil, fmt.Errorf("onboarding routing: %w", err)
	}
	steps = append(steps, approval.StepSpec{Order: 1, PositionID: wmID, Label: "Wealth Manager Review"})

	if c.RiskFlag {
		mdID, err := get("MANAGING_DIRECTOR")
		if err != nil {
			return nil, fmt.Errorf("onboarding routing: %w", err)
		}
		steps = append(steps, approval.StepSpec{Order: 2, PositionID: mdID, Label: "Managing Director Review"})
	}

	cmID, err := get("COMPLIANCE_MANAGER")
	if err != nil {
		return nil, fmt.Errorf("onboarding routing: %w", err)
	}
	steps = append(steps, approval.StepSpec{Order: int32(len(steps) + 1), PositionID: cmID, Label: "Compliance Review"})

	return steps, nil
}

// HandleApprovalEvent is registered as a terminal event handler with the
// approval service. It advances the case state machine on terminal outcomes.
func (s *Service) HandleApprovalEvent(ctx context.Context, e approval.TerminalEvent) error {
	if e.ResourceType != "onboarding_case" {
		return nil
	}
	return s.store.ExecTx(ctx, func(q *onboardingdb.Queries, tx pgx.Tx) error {
		switch e.Outcome {
		case "approved":
			// Case approved → active client
			caseRow, err := q.GetCase(ctx, e.ResourceID)
			if err != nil {
				return err
			}
			if _, err := q.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{
				ID: e.ResourceID, State: "approved",
			}); err != nil {
				return err
			}
			// Mark the client as active — propagate error so the transaction rolls back
			// if status update fails (prevents orphaned approved cases with inactive clients).
			if _, err := q.UpdateClientStatus(ctx, onboardingdb.UpdateClientStatusParams{
				ID: caseRow.ClientID, Status: "active",
			}); err != nil {
				return fmt.Errorf("onboarding: set client active: %w", err)
			}
			_ = s.audit.Write(ctx, audit.Entry{
				Actor: audit.Actor{Type: "system"}, Action: "onboarding.case.approved",
				ResourceType: "onboarding_case", ResourceID: e.ResourceID.String(),
			})
			if emailInfo, err := q.GetClientEmailByCase(ctx, e.ResourceID); err == nil && emailInfo.Email != "" {
				_ = notification.Shared().Enqueue(ctx, tx, notification.Message{
					EventType:     "onboarding.case.approved",
					TargetAddress: emailInfo.Email,
					Subject:       "Your Page Capital Account is Open",
					BodyText:      fmt.Sprintf("Dear %s,\n\nYour account has been successfully opened.", emailInfo.DisplayName),
				})
			}
		case "rejected":
			if _, err := q.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{
				ID: e.ResourceID, State: "rejected",
			}); err != nil {
				return err
			}
			if emailInfo, err := q.GetClientEmailByCase(ctx, e.ResourceID); err == nil && emailInfo.Email != "" {
				_ = notification.Shared().Enqueue(ctx, tx, notification.Message{
					EventType:     "onboarding.case.rejected",
					TargetAddress: emailInfo.Email,
					Subject:       "Update on your Page Capital Application",
					BodyText:      fmt.Sprintf("Dear %s,\n\nUnfortunately, we are unable to open your account at this time.", emailInfo.DisplayName),
				})
			}
		case "returned":
			if _, err := q.ReturnCase(ctx, onboardingdb.ReturnCaseParams{
				ID: e.ResourceID, ReturnNotes: e.Notes,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// ── Compliance ────────────────────────────────────────────────────────────────

func (s *Service) RecordComplianceCheck(ctx context.Context, caseID uuid.UUID, checkType string, outcome domain.CheckOutcome, notes string, userID uuid.UUID) (domain.ComplianceCheck, error) {
	row, err := s.store.UpsertComplianceCheck(ctx, onboardingdb.UpsertComplianceCheckParams{
		CaseID:      caseID,
		CheckType:   checkType,
		Outcome:     string(outcome),
		Notes:       notes,
		Source:      "manual",
		PerformedBy: userID,
	})
	if err != nil {
		return domain.ComplianceCheck{}, fmt.Errorf("onboarding: record compliance check: %w", err)
	}
	chk := toComplianceCheck(row)

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: userID.String()}, Action: "onboarding.compliance_check.recorded",
		ResourceType: "onboarding_case", ResourceID: caseID.String(),
		Context: map[string]any{"check_type": checkType, "outcome": string(outcome)},
	})

	if outcome == domain.OutcomeFail {
		_ = s.store.SetCaseRiskFlag(ctx, onboardingdb.SetCaseRiskFlagParams{
			ID:        caseID,
			RiskFlag:  true,
			RiskNotes: fmt.Sprintf("Failed compliance check: %s", checkType),
		})
	}
	return chk, nil
}

// ApproveCase directly transitions a case to approved state (compliance-initiated).
func (s *Service) ApproveCase(ctx context.Context, caseID, userID uuid.UUID) (domain.OnboardingCase, error) {
	var result domain.OnboardingCase
	err := s.store.ExecTx(ctx, func(q *onboardingdb.Queries, tx pgx.Tx) error {
		caseRow, err := q.GetCase(ctx, caseID)
		if err != nil {
			return ErrCaseNotFound
		}
		if caseRow.State != "in_review" && caseRow.State != "compliance_review" && caseRow.State != "submitted" {
			return fmt.Errorf("onboarding: case must be in review to approve (current: %s)", caseRow.State)
		}
		updated, err := q.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{ID: caseID, State: "approved"})
		if err != nil {
			return err
		}
		_, _ = q.UpdateClientStatus(ctx, onboardingdb.UpdateClientStatusParams{ID: caseRow.ClientID, Status: "active"})
		_ = s.audit.Write(ctx, audit.Entry{
			Actor:        audit.Actor{Type: "user", ID: userID.String()},
			Action:       "onboarding.case.approved",
			ResourceType: "onboarding_case",
			ResourceID:   caseID.String(),
		})
		if emailInfo, err := q.GetClientEmailByCase(ctx, caseID); err == nil && emailInfo.Email != "" {
			_ = notification.Shared().Enqueue(ctx, tx, notification.Message{
				EventType:     "onboarding.case.approved",
				TargetAddress: emailInfo.Email,
				Subject:       "Your Page Capital Account is Open",
				BodyText:      fmt.Sprintf("Dear %s,\n\nYour account has been successfully opened.", emailInfo.DisplayName),
			})
		}
		result = toCase(updated)
		return nil
	})
	return result, err
}

// RejectCase directly transitions a case to rejected state.
func (s *Service) RejectCase(ctx context.Context, caseID, userID uuid.UUID, reason string) (domain.OnboardingCase, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		return domain.OnboardingCase{}, ErrCaseNotFound
	}
	if caseRow.State != "in_review" && caseRow.State != "compliance_review" && caseRow.State != "submitted" {
		return domain.OnboardingCase{}, fmt.Errorf("onboarding: case must be in review to reject (current: %s)", caseRow.State)
	}
	updated, err := s.store.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{ID: caseID, State: "rejected"})
	if err != nil {
		return domain.OnboardingCase{}, err
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "onboarding.case.rejected",
		ResourceType: "onboarding_case",
		ResourceID:   caseID.String(),
		Context:      map[string]any{"reason": reason},
	})
	return toCase(updated), nil
}

// ReturnCaseToWM sends a case back to draft state with notes for the WM.
func (s *Service) ReturnCaseToWM(ctx context.Context, caseID, userID uuid.UUID, notes string) (domain.OnboardingCase, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		return domain.OnboardingCase{}, ErrCaseNotFound
	}
	_ = caseRow
	updated, err := s.store.ReturnCase(ctx, onboardingdb.ReturnCaseParams{ID: caseID, ReturnNotes: notes})
	if err != nil {
		return domain.OnboardingCase{}, err
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "onboarding.case.returned",
		ResourceType: "onboarding_case",
		ResourceID:   caseID.String(),
		Context:      map[string]any{"notes": notes},
	})
	return toCase(updated), nil
}

// ReopenCase transitions a rejected/approved case back to compliance_review.
func (s *Service) ReopenCase(ctx context.Context, caseID, userID uuid.UUID) (domain.OnboardingCase, error) {
	caseRow, err := s.store.GetCase(ctx, caseID)
	if err != nil {
		return domain.OnboardingCase{}, ErrCaseNotFound
	}
	if caseRow.State != "rejected" && caseRow.State != "approved" {
		return domain.OnboardingCase{}, fmt.Errorf("onboarding: only rejected or approved cases can be reopened (current: %s)", caseRow.State)
	}
	updated, err := s.store.UpdateCaseState(ctx, onboardingdb.UpdateCaseStateParams{ID: caseID, State: "compliance_review"})
	if err != nil {
		return domain.OnboardingCase{}, err
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "onboarding.case.reopened",
		ResourceType: "onboarding_case",
		ResourceID:   caseID.String(),
	})
	return toCase(updated), nil
}

func (s *Service) ListComplianceChecks(ctx context.Context, caseID uuid.UUID) ([]domain.ComplianceCheck, error) {
	rows, err := s.store.ListComplianceChecksByCase(ctx, caseID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.ComplianceCheck, 0, len(rows))
	for _, r := range rows {
		out = append(out, toComplianceCheck(r))
	}
	return out, nil
}

// ListComplianceChecksWithNames returns compliance checks enriched with performer display names.
func (s *Service) ListComplianceChecksWithNames(ctx context.Context, caseID uuid.UUID) ([]domain.ComplianceCheckWithName, error) {
	return s.store.ListComplianceChecksWithNames(ctx, caseID)
}

// AddCaseNote logs a follow-up note (client or compliance interaction) for a case.
func (s *Service) AddCaseNote(ctx context.Context, caseID, authorID uuid.UUID, noteType, content string) (domain.CaseNote, error) {
	if content == "" {
		return domain.CaseNote{}, fmt.Errorf("onboarding: note content is required")
	}
	validTypes := map[string]bool{"internal": true, "client": true, "compliance": true}
	if !validTypes[noteType] {
		noteType = "internal"
	}
	return s.store.AddCaseNote(ctx, caseID, authorID, noteType, content)
}

// ListCaseNotes returns all notes for a case, newest first.
func (s *Service) ListCaseNotes(ctx context.Context, caseID uuid.UUID) ([]domain.CaseNote, error) {
	return s.store.ListCaseNotes(ctx, caseID)
}

// ── RM–Client assignments ─────────────────────────────────────────────────────

// AssignRM links a client to a Relationship Manager. Ends any existing link first.
func (s *Service) AssignRM(ctx context.Context, clientID, rmPersonID, subsidiaryID, assignedBy uuid.UUID) (domain.RMClient, error) {
	// End existing active assignment (if any) — ignore not-found error.
	_ = s.store.EndRMClientLink(ctx, clientID)

	row, err := s.store.CreateRMClientLink(ctx, onboardingdb.CreateRMClientLinkParams{
		ClientID:     clientID,
		RmPersonID:   rmPersonID,
		SubsidiaryID: subsidiaryID,
		AssignedBy:   assignedBy,
	})
	if err != nil {
		return domain.RMClient{}, fmt.Errorf("onboarding: assign RM: %w", err)
	}
	rm := toRMClient(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: assignedBy.String()}, Action: "onboarding.rm_assigned",
		ResourceType: "client", ResourceID: clientID.String(),
		Context: map[string]any{"rm_person_id": rmPersonID.String()},
	})
	return rm, nil
}

// UnassignRM ends the active RM assignment for a client.
func (s *Service) UnassignRM(ctx context.Context, clientID, unassignedBy uuid.UUID) error {
	return s.store.EndRMClientLink(ctx, clientID)
}

// ListRMClients returns all active clients managed by a given RM person.
func (s *Service) ListRMClients(ctx context.Context, rmPersonID uuid.UUID) ([]domain.Client, error) {
	rows, err := s.store.ListActiveClientsByRM(ctx, rmPersonID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Client, 0, len(rows))
	for _, r := range rows {
		out = append(out, toClient(r))
	}
	return out, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

// materialiseRequirements upserts one RequirementInstance row per item in the
// set, evaluating conditions against the provided ApplicationFields.
func (s *Service) materialiseRequirements(ctx context.Context, caseID uuid.UUID, reqSet domain.RequirementSet, fields domain.ApplicationFields) error {
	for _, item := range reqSet.Items {
		status := "pending"
		if item.Obligation == domain.Conditional {
			if item.Condition == nil || !item.Condition(fields) {
				status = "not_applicable"
			}
		}
		// For consent items: check the field directly.
		if item.Category == domain.ConsentCategory && item.Key == "tnc_acceptance" && fields.TNCAccepted {
			status = "satisfied"
		}
		if _, err := s.store.UpsertRequirementInstance(ctx, onboardingdb.UpsertRequirementInstanceParams{
			CaseID:         caseID,
			RequirementKey: item.Key,
			Label:          item.Label,
			Category:       string(item.Category),
			Obligation:     string(item.Obligation),
			Status:         status,
		}); err != nil {
			return err
		}
	}
	return nil
}

func allRequiredSatisfied(reqs []domain.RequirementInstance) bool {
	for _, r := range reqs {
		if r.Obligation == string(domain.Required) && r.Status != "satisfied" {
			return false
		}
		if r.Obligation == string(domain.Conditional) && r.Status == "pending" {
			return false
		}
	}
	return true
}

// ── type mappings ─────────────────────────────────────────────────────────────

func toClient(r onboardingdb.OnboardingClient) domain.Client {
	return domain.Client{
		ID: r.ID, SubsidiaryID: r.SubsidiaryID, ClientType: r.ClientType,
		DisplayName: r.DisplayName, Status: r.Status, BrokerID: r.BrokerID,
	}
}

func toCase(r onboardingdb.OnboardingOnboardingCase) domain.OnboardingCase {
	c := domain.OnboardingCase{
		ID: r.ID, ClientID: r.ClientID, SubsidiaryID: r.SubsidiaryID,
		ClientType: r.ClientType, RequirementSetVersion: r.RequirementSetVersion,
		State: r.State, RiskFlag: r.RiskFlag, RiskNotes: r.RiskNotes,
		ReturnCount: r.ReturnCount, ReturnNotes: r.ReturnNotes,
		InitiatedBy: r.InitiatedBy, TNCVersion: r.TncVersion,
	}
	if r.TncAcceptedAt.Valid {
		t := r.TncAcceptedAt.Time
		c.TNCAcceptedAt = &t
	}
	if r.SubmittedAt.Valid {
		t := r.SubmittedAt.Time
		c.SubmittedAt = &t
	}
	return c
}

func toApplicationData(r onboardingdb.OnboardingApplicationDatum) domain.ApplicationData {
	d := domain.ApplicationData{
		CaseID: r.CaseID, FullName: r.FullName, Gender: r.Gender,
		MothersMaidenName: r.MothersMaidenName, PlaceOfBirth: r.PlaceOfBirth,
		CountryOfOrigin: r.CountryOfOrigin, PlaceOfResidence: r.PlaceOfResidence,
		ResidentialAddress: r.ResidentialAddress, IsUSPerson: r.IsUsPerson,
		USAddress: r.UsAddress, PhoneNumbers: r.PhoneNumbers, Email: r.Email,
		TIN: r.Tin, NextOfKinName: r.NextOfKinName, NextOfKinEmail: r.NextOfKinEmail,
		NextOfKinPhone: r.NextOfKinPhone, Employer: r.Employer,
		EmployerAddress: r.EmployerAddress, OfficialEmail: r.OfficialEmail,
		OfficialPhone: r.OfficialPhone, IsPEP: r.IsPep, PEPPosition: r.PepPosition,
		PEPPeriod: r.PepPeriod, SourceOfFunds: r.SourceOfFunds,
		SourceOfWealth: r.SourceOfWealth, InvestmentPurpose: r.InvestmentPurpose,
		InvestmentAmountKobo: r.InvestmentAmountKobo, InvestmentAmountWords: r.InvestmentAmountWords,
		Tenor: r.Tenor, InterestRateBps: r.InterestRateBps,
		BankName: r.BankName, BankAccountName: r.BankAccountName,
		BankAccountNumber: r.BankAccountNumber, BVN: r.Bvn, SortCode: r.SortCode,
		DeclarationLegalCapacity: r.DeclarationLegalCapacity,
		DeclarationInfoCorrect:   r.DeclarationInfoCorrect,
		DeclarationTNCAccepted:   r.DeclarationTncAccepted,
		DeclarationMinHolding:    r.DeclarationMinHolding,
	}
	if r.DateOfBirth.Valid {
		t := r.DateOfBirth.Time
		d.DateOfBirth = &t
	}
	if len(r.SocialMedia) > 0 {
		_ = json.Unmarshal(r.SocialMedia, &d.SocialMedia)
	}
	return d
}

func toRequirementInstance(r onboardingdb.OnboardingRequirementInstance) domain.RequirementInstance {
	ri := domain.RequirementInstance{
		ID: r.ID, CaseID: r.CaseID, RequirementKey: r.RequirementKey,
		Label: r.Label, Category: r.Category, Obligation: r.Obligation,
		Status: r.Status, DocumentID: r.DocumentID,
	}
	if r.SatisfiedAt.Valid {
		t := r.SatisfiedAt.Time
		ri.SatisfiedAt = &t
	}
	return ri
}

func toRMClient(r onboardingdb.OnboardingRmClient) domain.RMClient {
	rm := domain.RMClient{
		ID: r.ID, ClientID: r.ClientID, RMPersonID: r.RmPersonID,
		SubsidiaryID: r.SubsidiaryID, AssignedBy: r.AssignedBy,
	}
	if r.AssignedAt.Valid {
		rm.AssignedAt = r.AssignedAt.Time
	}
	if r.EndedAt.Valid {
		t := r.EndedAt.Time
		rm.EndedAt = &t
	}
	return rm
}

func toComplianceCheck(r onboardingdb.OnboardingComplianceCheck) domain.ComplianceCheck {
	return domain.ComplianceCheck{
		ID:          r.ID,
		CaseID:      r.CaseID,
		CheckType:   r.CheckType,
		Outcome:     domain.CheckOutcome(r.Outcome),
		Notes:       r.Notes,
		Source:      r.Source,
		PerformedBy: r.PerformedBy,
		PerformedAt: r.PerformedAt.Time,
	}
}
