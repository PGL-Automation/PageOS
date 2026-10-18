package payout

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Step specification ────────────────────────────────────────────────────────

// stepSpec describes a single node in an approval chain before it is
// materialised into an ApprovalStep with a real assignee and timestamp.
type stepSpec struct {
	typ          StepType
	roleKey      string
	limitMinutes int
}

// Shared step-limit constants (minutes).
const (
	stepLimit20Min = 20      // fast track (transfers, placements, client payouts)
	stepLimit4h    = 4 * 60  // expense: head / IC step
	stepLimit8h    = 8 * 60  // expense: finance / MD / CEO step
)

// ── stepLimitMinutes ──────────────────────────────────────────────────────────

// stepLimitMinutes returns how many minutes an approver has to act before the
// step is considered overdue (and eventually escalated).
//
// Rules:
//
//	client_payout / liquidation / transfer — all steps: 20 min
//	placement                              — all steps: 20 min
//	expense ≤ ₦1 m  head_concur / internal_control: 4 h
//	                 finance_check / md:              8 h (same-day 17:00 equivalent)
//	expense > ₦1 m  head_concur / internal_control: 4 h
//	                 finance_check / md / ceo:        8 h
func stepLimitMinutes(stepType StepType, requestType RequestType, amountKobo int64) int {
	switch requestType {
	case RequestTypeClientPayout, RequestTypeLiquidation, RequestTypeTransfer:
		return stepLimit20Min

	case RequestTypePlacement:
		return stepLimit20Min

	case RequestTypeExpense:
		switch stepType {
		case StepTypeHeadConcur, StepTypeInternalControl:
			return stepLimit4h
		case StepTypeFinanceCheck, StepTypeMD, StepTypeCEO:
			return stepLimit8h
		}
	}

	// Safe default — match the fastest path so we never block indefinitely.
	return stepLimit20Min
}

// ── buildSteps ────────────────────────────────────────────────────────────────

// buildSteps constructs the ordered ApprovalStep chain for req.
//
// approvers is a map from position-role key (e.g. "HEAD_OF_DEPT") to the
// identity.users.id of the person currently holding that role.  If a role UUID
// is uuid.Nil the corresponding step is inserted with status=skipped and
// due_by=now so it does not gate the chain.
//
// now is passed explicitly so callers (and tests) control the reference clock.
func buildSteps(req PaymentRequest, approvers map[string]uuid.UUID, now time.Time) []ApprovalStep {
	var specs []stepSpec

	switch req.RequestType {
	case RequestTypeClientPayout, RequestTypeLiquidation, RequestTypeTransfer:
		specs = []stepSpec{
			{StepTypeHeadConcur, "HEAD_OF_DEPT", stepLimit20Min},
			{StepTypeInternalControl, "INTERNAL_CONTROL", stepLimit20Min},
		}
		if req.ComplianceFlagged {
			specs = append(specs, stepSpec{StepTypeCompliance, "COMPLIANCE", stepLimit20Min})
		}
		specs = append(specs,
			stepSpec{StepTypeFinanceCheck, "FINANCE", stepLimit20Min},
			stepSpec{StepTypeSignatory1, "SIGNATORY_1", stepLimit20Min},
			stepSpec{StepTypeSignatory2, "SIGNATORY_2", stepLimit20Min},
		)

	case RequestTypeExpense:
		if req.AmountKobo <= 100_000_00 {
			// ≤ ₦1 m
			specs = []stepSpec{
				{StepTypeHeadConcur, "HEAD_OF_DEPT", stepLimit4h},
				{StepTypeInternalControl, "INTERNAL_CONTROL", stepLimit4h},
				{StepTypeFinanceCheck, "FINANCE", stepLimit8h},
				{StepTypeMD, "MD", stepLimit8h},
			}
		} else {
			// > ₦1 m
			specs = []stepSpec{
				{StepTypeHeadConcur, "HEAD_OF_DEPT", stepLimit4h},
				{StepTypeInternalControl, "INTERNAL_CONTROL", stepLimit4h},
				{StepTypeFinanceCheck, "FINANCE", stepLimit8h},
				{StepTypeMD, "MD", stepLimit8h},
				{StepTypeCEO, "CEO", stepLimit8h},
			}
		}

	case RequestTypePlacement:
		specs = []stepSpec{
			{StepTypeHeadConcur, "HEAD_OF_DEPT", stepLimit20Min},
			{StepTypeInternalControl, "INTERNAL_CONTROL", stepLimit20Min},
			{StepTypeFinanceCheck, "FINANCE", stepLimit20Min},
			{StepTypeMD, "MD", stepLimit20Min},
		}
	}

	steps := make([]ApprovalStep, 0, len(specs))
	for i, s := range specs {
		assignee := approvers[s.roleKey]

		step := ApprovalStep{
			ID:         uuid.New(),
			RequestID:  req.ID,
			StepOrder:  i + 1,
			StepType:   s.typ,
			AssignedTo: assignee,
			CreatedAt:  now,
		}

		if assignee == uuid.Nil {
			// Role not found — skip so the chain is not permanently blocked.
			step.Status = StepStatusSkipped
			step.DueBy = now
		} else {
			step.Status = StepStatusPending
			step.DueBy = now.Add(time.Duration(s.limitMinutes) * time.Minute)
		}

		steps = append(steps, step)
	}

	return steps
}

// ── resolveApprovers ─────────────────────────────────────────────────────────

// resolveApprovers queries the organisation tables to build the approvers map
// expected by buildSteps.  A uuid.Nil value for any key means the role could
// not be resolved; buildSteps treats that as a skipped step.
//
// Position codes searched:
//
//	HEAD_OF_DEPT     — primary holder of HEAD_OF_OPERATIONS or FINOPS_MANAGER
//	                   in the same subsidiary as req.SubsidiaryID (dept family match preferred)
//	INTERNAL_CONTROL — holder of INTERNAL_CONTROL (group-level or subsidiary)
//	COMPLIANCE       — holder of COMPLIANCE_OFFICER
//	FINANCE          — holder of FINOPS_MANAGER
//	SIGNATORY_1      — holder of BANK_SIGNATORY_1
//	SIGNATORY_2      — holder of BANK_SIGNATORY_2
//	MD               — holder of GROUP_ADMIN (MD role) — group-level
//	CEO              — holder of CEO — group-level
func resolveApprovers(ctx context.Context, pool *pgxpool.Pool, req PaymentRequest) (map[string]uuid.UUID, error) {
	out := map[string]uuid.UUID{
		"HEAD_OF_DEPT":     uuid.Nil,
		"INTERNAL_CONTROL": uuid.Nil,
		"COMPLIANCE":       uuid.Nil,
		"FINANCE":          uuid.Nil,
		"SIGNATORY_1":      uuid.Nil,
		"SIGNATORY_2":      uuid.Nil,
		"MD":               uuid.Nil,
		"CEO":              uuid.Nil,
	}

	// ── HEAD_OF_DEPT ──────────────────────────────────────────────────────────
	// Find the primary position holder for HEAD_OF_OPERATIONS or FINOPS_MANAGER
	// within the same subsidiary.  We prefer a holder in the same department
	// family as the raiser, but fall back to any head in the subsidiary.
	{
		const q = `
			SELECT DISTINCT ON (pos.code)
			       per.user_id
			FROM   organization.assignment  a
			JOIN   organization.position    pos ON pos.id  = a.position_id
			JOIN   organization.person      per ON per.id  = a.person_id
			WHERE  a.subsidiary_id      = $1
			  AND  pos.code             = ANY($2::text[])
			  AND  a.is_primary         = true
			  AND  a.effective_from    <= CURRENT_DATE
			  AND  (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			  AND  per.user_id IS NOT NULL
			  AND  per.user_id         != $3
			ORDER  BY pos.code,
			          -- prefer same department family as raiser
			          CASE WHEN a.department_id IN (
			              SELECT department_id FROM organization.assignment a2
			              JOIN   organization.person p2 ON p2.id = a2.person_id
			              WHERE  p2.user_id = $3
			                AND  a2.effective_from  <= CURRENT_DATE
			                AND  (a2.effective_to IS NULL OR a2.effective_to >= CURRENT_DATE)
			              LIMIT  1
			          ) THEN 0 ELSE 1 END
			LIMIT  1
		`
		headCodes := []string{"HEAD_OF_OPERATIONS", "FINOPS_MANAGER", "DEPARTMENT_HEAD"}
		var userID uuid.UUID
		err := pool.QueryRow(ctx, q, req.SubsidiaryID, headCodes, req.RaisedBy).Scan(&userID)
		if err == nil {
			out["HEAD_OF_DEPT"] = userID
		}
	}

	// ── Subsidiary-scoped or group-level roles ────────────────────────────────
	// resolveRole returns the user_id of the primary holder of positionCode,
	// first looking within the subsidiary, then falling back to a group-level
	// position (subsidiary_id IS NULL).
	resolveRole := func(positionCode string, excludeUser uuid.UUID) uuid.UUID {
		const q = `
			SELECT per.user_id
			FROM   organization.assignment  a
			JOIN   organization.position    pos ON pos.id  = a.position_id
			JOIN   organization.person      per ON per.id  = a.person_id
			WHERE  pos.code                 = $1
			  AND  (a.subsidiary_id = $2 OR pos.subsidiary_id IS NULL)
			  AND  a.effective_from        <= CURRENT_DATE
			  AND  (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			  AND  per.user_id IS NOT NULL
			  AND  ($3 = '00000000-0000-0000-0000-000000000000'::uuid OR per.user_id != $3)
			ORDER  BY
			          -- prefer subsidiary-scoped over group-level
			          CASE WHEN a.subsidiary_id = $2 THEN 0 ELSE 1 END,
			          a.is_primary DESC
			LIMIT  1
		`
		var userID uuid.UUID
		err := pool.QueryRow(ctx, q, positionCode, req.SubsidiaryID, excludeUser).Scan(&userID)
		if err != nil {
			return uuid.Nil
		}
		return userID
	}

	// ── Group-level only roles ────────────────────────────────────────────────
	// Some roles (MD, CEO) are always held at group level.
	resolveGroupRole := func(positionCode string) uuid.UUID {
		const q = `
			SELECT per.user_id
			FROM   organization.assignment  a
			JOIN   organization.position    pos ON pos.id  = a.position_id
			JOIN   organization.person      per ON per.id  = a.person_id
			WHERE  pos.code             = $1
			  AND  pos.subsidiary_id IS NULL
			  AND  a.effective_from    <= CURRENT_DATE
			  AND  (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
			  AND  per.user_id IS NOT NULL
			ORDER  BY a.is_primary DESC
			LIMIT  1
		`
		var userID uuid.UUID
		if err := pool.QueryRow(ctx, q, positionCode).Scan(&userID); err != nil {
			return uuid.Nil
		}
		return userID
	}

	out["INTERNAL_CONTROL"] = resolveRole("INTERNAL_CONTROL", uuid.Nil)
	out["COMPLIANCE"] = resolveRole("COMPLIANCE_OFFICER", uuid.Nil)
	out["FINANCE"] = resolveRole("FINOPS_MANAGER", uuid.Nil)
	out["SIGNATORY_1"] = resolveRole("BANK_SIGNATORY_1", uuid.Nil)
	out["SIGNATORY_2"] = resolveRole("BANK_SIGNATORY_2", uuid.Nil)
	out["MD"] = resolveGroupRole("GROUP_ADMIN")
	out["CEO"] = resolveGroupRole("CEO")

	return out, nil
}
