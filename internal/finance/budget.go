package finance

import (
	"context"
	"math"
	"time"

	"github.com/google/uuid"
)

// ── Budget vs Actual ──────────────────────────────────────────────────────────

type BudgetEntry struct {
	AccountCode  string     `json:"account_code"`
	AccountName  string     `json:"account_name"`
	AccountGroup string     `json:"account_group"`
	AccountType  string     `json:"account_type"`
	Amount       float64    `json:"amount"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type BudgetLine struct {
	AccountCode  string  `json:"account_code"`
	AccountName  string  `json:"account_name"`
	AccountGroup string  `json:"account_group"`
	AccountType  string  `json:"account_type"` // REVENUE | EXPENSE
	Budget       float64 `json:"budget"`
	Actual       float64 `json:"actual"`
	Variance     float64 `json:"variance"`  // actual - budget
	VariancePct  float64 `json:"variance_pct"`
}

type BudgetVarianceReport struct {
	Year   int          `json:"year"`
	Month  int          `json:"month"`
	Lines  []BudgetLine `json:"lines"`
	// Totals
	TotalRevenueBudget  float64 `json:"total_revenue_budget"`
	TotalRevenueActual  float64 `json:"total_revenue_actual"`
	TotalExpenseBudget  float64 `json:"total_expense_budget"`
	TotalExpenseActual  float64 `json:"total_expense_actual"`
	NetBudget           float64 `json:"net_budget"`
	NetActual           float64 `json:"net_actual"`
}

type UpsertBudgetInput struct {
	AccountCode  string  `json:"account_code"`
	Amount       float64 `json:"amount"`
}

// UpsertBudgets bulk-sets budget amounts for a given period. Existing entries
// are updated; new ones are inserted. Zero-amount entries are kept (explicit zero budget).
func (s *Service) UpsertBudgets(ctx context.Context, subsidiaryID *uuid.UUID, year, month int, entries []UpsertBudgetInput, byID uuid.UUID) error {
	for _, e := range entries {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO finance.budget
			    (subsidiary_id, account_code, period_year, period_month, amount, created_by, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,now())
			ON CONFLICT (subsidiary_id, account_code, period_year, period_month)
			DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
		`, subsidiaryID, e.AccountCode, year, month, e.Amount, byID)
		if err != nil {
			return err
		}
	}
	return nil
}

// GetBudgetVariance returns all revenue and expense accounts with their budget
// targets and actual posted amounts for a given year/month.
func (s *Service) GetBudgetVariance(ctx context.Context, subsidiaryID *uuid.UUID, year, month int) (BudgetVarianceReport, error) {
	const q = `
		SELECT
		    a.code,
		    a.name,
		    a.account_group,
		    a.account_type,
		    COALESCE(b.amount, 0)::float8 AS budget,
		    COALESCE(SUM(
		        CASE
		            WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit
		            WHEN a.account_type = 'EXPENSE' THEN jl.debit  - jl.credit
		            ELSE 0
		        END
		    ), 0)::float8 AS actual
		FROM finance.account a
		LEFT JOIN finance.budget b
		    ON  b.account_code  = a.code
		    AND b.period_year   = $1
		    AND b.period_month  = $2
		    AND ($3 = '' OR b.subsidiary_id::text = $3)
		LEFT JOIN finance.journal_line   jl ON jl.account_code = a.code
		LEFT JOIN finance.journal_header jh
		    ON  jh.id           = jl.journal_id
		    AND jh.status       = 'posted'
		    AND EXTRACT(YEAR  FROM jh.date)::int = $1
		    AND EXTRACT(MONTH FROM jh.date)::int = $2
		    AND ($3 = '' OR jh.subsidiary_id::text = $3)
		WHERE a.account_type IN ('REVENUE','EXPENSE')
		  AND a.is_header = false
		GROUP BY a.code, a.name, a.account_group, a.account_type, b.amount
		HAVING COALESCE(b.amount,0) > 0
		    OR COALESCE(SUM(
		           CASE
		               WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit
		               WHEN a.account_type = 'EXPENSE' THEN jl.debit  - jl.credit
		               ELSE 0
		           END
		       ), 0) <> 0
		ORDER BY a.account_type DESC, a.account_group, a.code
	`
	rows, err := s.pool.Query(ctx, q, year, month, subStr(subsidiaryID))
	if err != nil {
		return BudgetVarianceReport{}, err
	}
	defer rows.Close()

	var report BudgetVarianceReport
	report.Year = year
	report.Month = month

	for rows.Next() {
		var l BudgetLine
		if err := rows.Scan(&l.AccountCode, &l.AccountName, &l.AccountGroup,
			&l.AccountType, &l.Budget, &l.Actual); err != nil {
			return BudgetVarianceReport{}, err
		}
		l.Variance = math.Round((l.Actual-l.Budget)*100) / 100
		if l.Budget != 0 {
			l.VariancePct = math.Round((l.Variance/l.Budget)*10000) / 100
		}
		report.Lines = append(report.Lines, l)

		if l.AccountType == "REVENUE" {
			report.TotalRevenueBudget += l.Budget
			report.TotalRevenueActual += l.Actual
		} else {
			report.TotalExpenseBudget += l.Budget
			report.TotalExpenseActual += l.Actual
		}
	}
	if err := rows.Err(); err != nil {
		return BudgetVarianceReport{}, err
	}

	report.TotalRevenueBudget = math.Round(report.TotalRevenueBudget*100) / 100
	report.TotalRevenueActual = math.Round(report.TotalRevenueActual*100) / 100
	report.TotalExpenseBudget = math.Round(report.TotalExpenseBudget*100) / 100
	report.TotalExpenseActual = math.Round(report.TotalExpenseActual*100) / 100
	report.NetBudget          = math.Round((report.TotalRevenueBudget-report.TotalExpenseBudget)*100) / 100
	report.NetActual          = math.Round((report.TotalRevenueActual-report.TotalExpenseActual)*100) / 100

	return report, nil
}

// ListBudgets returns every budget entry for a period so the frontend can
// pre-fill the edit form.
func (s *Service) ListBudgets(ctx context.Context, subsidiaryID *uuid.UUID, year, month int) ([]BudgetEntry, error) {
	const q = `
		SELECT b.account_code, a.name, a.account_group, a.account_type,
		       b.amount::float8, b.updated_at
		FROM   finance.budget b
		JOIN   finance.account a ON a.code = b.account_code
		WHERE  b.period_year  = $1
		  AND  b.period_month = $2
		  AND  ($3 = '' OR b.subsidiary_id::text = $3)
		ORDER  BY a.account_type DESC, a.account_group, b.account_code
	`
	rows, err := s.pool.Query(ctx, q, year, month, subStr(subsidiaryID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BudgetEntry
	for rows.Next() {
		var e BudgetEntry
		if err := rows.Scan(&e.AccountCode, &e.AccountName, &e.AccountGroup,
			&e.AccountType, &e.Amount, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
