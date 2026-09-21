package reconciliation

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/pagegroup/pageos/internal/audit"
	recondb "github.com/pagegroup/pageos/internal/reconciliation/store/gen"
)

// BalanceValidationResult holds the outcome of comparing a statement's stated
// closing balance against the balance computed from its matched line flows.
type BalanceValidationResult struct {
	StatementID           uuid.UUID `json:"statement_id"`
	OpeningBalance        int64     `json:"opening_balance_kobo"`
	ClosingBalance        int64     `json:"closing_balance_kobo"`  // from statement
	ComputedClosing       int64     `json:"computed_closing_kobo"` // opening + net matched flows
	Difference            int64     `json:"difference_kobo"`       // computed - stated
	IsBalanced            bool      `json:"is_balanced"`
	TotalCredits          int64     `json:"total_credits_kobo"`
	TotalDebits           int64     `json:"total_debits_kobo"`
	UnmatchedBankLines    int       `json:"unmatched_bank_lines"`
	UnmatchedInternalTxns int       `json:"unmatched_internal_txns"`
}

// RunSummaryFull is a rich summary of a reconciliation run including match
// statistics for all bank accounts belonging to a subsidiary.
type RunSummaryFull struct {
	RunID                 uuid.UUID                `json:"run_id"`
	BankAccountID         uuid.UUID                `json:"bank_account_id"`
	BankName              string                   `json:"bank_name"`
	AccountNumber         string                   `json:"account_number"`
	PeriodStart           time.Time                `json:"period_start"`
	PeriodEnd             time.Time                `json:"period_end"`
	Status                string                   `json:"status"`
	TotalLines            int                      `json:"total_lines"`
	MatchedLines          int                      `json:"matched_lines"`
	UnmatchedBankLines    int                      `json:"unmatched_bank_lines"`
	UnmatchedInternalTxns int                      `json:"unmatched_internal_txns"`
	MatchRate             float64                  `json:"match_rate_pct"`
	BalanceValidation     *BalanceValidationResult `json:"balance_validation,omitempty"`
}

// ValidateBalance checks whether the stated closing balance on the bank
// statement that covers runID's period is consistent with the sum of its
// credited and debited line amounts.
//
// The allowed rounding tolerance is 1 kobo.
func (s *Service) ValidateBalance(ctx context.Context, runID uuid.UUID) (BalanceValidationResult, error) {
	// 1. Load the run to get bank_account_id and period bounds.
	var bankAccountID uuid.UUID
	var periodStart, periodEnd time.Time
	if err := s.store.Pool().QueryRow(ctx, `
		SELECT bank_account_id, period_start, period_end
		FROM   reconciliation.reconciliation_run
		WHERE  id = $1
	`, runID).Scan(&bankAccountID, &periodStart, &periodEnd); err != nil {
		return BalanceValidationResult{}, fmt.Errorf("reconciliation: validate balance: load run: %w", err)
	}

	// 2. Find the bank_statement whose period overlaps with the run period.
	var statementID uuid.UUID
	var openingBalance, closingBalance int64
	if err := s.store.Pool().QueryRow(ctx, `
		SELECT id, opening_balance, closing_balance
		FROM   reconciliation.bank_statement
		WHERE  bank_account_id = $1
		  AND  period_start   <= $3
		  AND  period_end     >= $2
		ORDER  BY period_start DESC
		LIMIT  1
	`, bankAccountID, periodStart, periodEnd).Scan(&statementID, &openingBalance, &closingBalance); err != nil {
		return BalanceValidationResult{}, fmt.Errorf("reconciliation: validate balance: find statement: %w", err)
	}

	// 3–4. Sum all credit and debit amounts from the statement's lines.
	var totalCredits, totalDebits int64
	if err := s.store.Pool().QueryRow(ctx, `
		SELECT COALESCE(SUM(credit_kobo), 0), COALESCE(SUM(debit_kobo), 0)
		FROM   reconciliation.bank_statement_line
		WHERE  statement_id = $1
	`, statementID).Scan(&totalCredits, &totalDebits); err != nil {
		return BalanceValidationResult{}, fmt.Errorf("reconciliation: validate balance: sum lines: %w", err)
	}

	// 5. Compute closing balance from the line flows.
	computedClosing := openingBalance + totalCredits - totalDebits

	// 6. Difference: positive means computed exceeds stated.
	difference := computedClosing - closingBalance

	// 7. Allow up to 1 kobo rounding tolerance.
	isBalanced := abs64(difference) <= 1

	// 8. Count matched and unmatched lines for this run.
	var unmatchedBank, unmatchedInternal int
	if err := s.store.Pool().QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE status = 'unmatched_bank')     AS unmatched_bank,
		    COUNT(*) FILTER (WHERE status = 'unmatched_internal') AS unmatched_internal
		FROM   reconciliation.reconciliation_match
		WHERE  run_id = $1
	`, runID).Scan(&unmatchedBank, &unmatchedInternal); err != nil {
		return BalanceValidationResult{}, fmt.Errorf("reconciliation: validate balance: count unmatched: %w", err)
	}

	return BalanceValidationResult{
		StatementID:           statementID,
		OpeningBalance:        openingBalance,
		ClosingBalance:        closingBalance,
		ComputedClosing:       computedClosing,
		Difference:            difference,
		IsBalanced:            isBalanced,
		TotalCredits:          totalCredits,
		TotalDebits:           totalDebits,
		UnmatchedBankLines:    unmatchedBank,
		UnmatchedInternalTxns: unmatchedInternal,
	}, nil
}

// TryAutoClose closes the run automatically when every item has been matched
// or acknowledged as an adjustment. Returns (true, nil) if the run was closed,
// (false, nil) if there are still genuinely unmatched items.
func (s *Service) TryAutoClose(ctx context.Context, runID uuid.UUID) (bool, error) {
	sum, err := s.store.GetRunSummary(ctx, runID)
	if err != nil {
		return false, fmt.Errorf("reconciliation: try auto close: get summary: %w", err)
	}
	if sum.UnmatchedBank+sum.UnmatchedInternal > 0 {
		return false, nil
	}

	systemUser := uuid.Nil
	now := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	if _, err := s.store.UpdateRunStatus(ctx, recondb.UpdateRunStatusParams{
		ID:           runID,
		Status:       "closed",
		ReconciledBy: &systemUser,
		ReconciledAt: now,
	}); err != nil {
		return false, fmt.Errorf("reconciliation: try auto close: update status: %w", err)
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "system"},
		Action:       "reconciliation.run.auto_closed",
		ResourceType: "reconciliation_run", ResourceID: runID.String(),
	})
	return true, nil
}

// GetAllRunSummaries returns a summary row for every reconciliation run that
// belongs to the given subsidiary, ordered by period_end DESC.
func (s *Service) GetAllRunSummaries(ctx context.Context, subsidiaryID uuid.UUID) ([]RunSummaryFull, error) {
	return s.queryRunSummaries(ctx, subsidiaryID, false)
}

// GetExceptionSummary returns only runs that are not yet closed and still have
// unresolved bank lines or internal transactions — runs that need human attention.
func (s *Service) GetExceptionSummary(ctx context.Context, subsidiaryID uuid.UUID) ([]RunSummaryFull, error) {
	return s.queryRunSummaries(ctx, subsidiaryID, true)
}

// queryRunSummaries is the shared implementation for GetAllRunSummaries and
// GetExceptionSummary. When exceptionsOnly is true, it applies the exception filter.
func (s *Service) queryRunSummaries(ctx context.Context, subsidiaryID uuid.UUID, exceptionsOnly bool) ([]RunSummaryFull, error) {
	const baseQuery = `
		SELECT
		    rr.id                                                                   AS run_id,
		    rr.bank_account_id,
		    ba.bank_name,
		    ba.account_number,
		    rr.period_start,
		    rr.period_end,
		    rr.status,
		    COUNT(rm.id)                                                            AS total_lines,
		    COUNT(rm.id) FILTER (WHERE rm.status = 'matched')                      AS matched_lines,
		    COUNT(rm.id) FILTER (WHERE rm.status = 'unmatched_bank')               AS unmatched_bank,
		    COUNT(rm.id) FILTER (WHERE rm.status = 'unmatched_internal')           AS unmatched_internal
		FROM       reconciliation.reconciliation_run  rr
		JOIN       reconciliation.bank_account        ba ON ba.id = rr.bank_account_id
		LEFT JOIN  reconciliation.reconciliation_match rm ON rm.run_id = rr.id
		WHERE      ba.subsidiary_id = $1
		GROUP BY   rr.id, ba.bank_name, ba.account_number
	`

	const allOrder = `ORDER BY rr.period_end DESC`
	const exceptFilter = `
		HAVING rr.status != 'closed'
		   AND (
		       COUNT(rm.id) FILTER (WHERE rm.status = 'unmatched_bank')     > 0
		    OR COUNT(rm.id) FILTER (WHERE rm.status = 'unmatched_internal') > 0
		   )
		ORDER BY rr.period_end DESC
	`

	var query string
	if exceptionsOnly {
		query = baseQuery + exceptFilter
	} else {
		query = baseQuery + allOrder
	}

	rows, err := s.store.Pool().Query(ctx, query, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("reconciliation: run summaries: query: %w", err)
	}
	defer rows.Close()

	var out []RunSummaryFull
	for rows.Next() {
		var r RunSummaryFull
		var totalLines, matchedLines, unmatchedBank, unmatchedInternal int
		var periodStart, periodEnd time.Time
		if err := rows.Scan(
			&r.RunID,
			&r.BankAccountID,
			&r.BankName,
			&r.AccountNumber,
			&periodStart,
			&periodEnd,
			&r.Status,
			&totalLines,
			&matchedLines,
			&unmatchedBank,
			&unmatchedInternal,
		); err != nil {
			return nil, fmt.Errorf("reconciliation: run summaries: scan: %w", err)
		}
		r.PeriodStart = periodStart
		r.PeriodEnd = periodEnd
		r.TotalLines = totalLines
		r.MatchedLines = matchedLines
		r.UnmatchedBankLines = unmatchedBank
		r.UnmatchedInternalTxns = unmatchedInternal
		if totalLines > 0 {
			r.MatchRate = float64(matchedLines) / float64(totalLines) * 100
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reconciliation: run summaries: rows: %w", err)
	}
	return out, nil
}

// abs64 returns the absolute value of v.
func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
