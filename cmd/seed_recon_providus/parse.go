package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/reconciliation"
)

// parseBankStatement reads the Providus bank statement Excel (.xlsx).
func parseBankStatement(path string) ([]reconciliation.ParsedLine, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	return reconciliation.ProvidusStatementParser{}.Parse(f)
}

// parseGLLedger reads the Providus GL ledger Excel.
func parseGLLedger(path string) ([]reconciliation.LedgerLine, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	return reconciliation.ProvidusGLParser{}.Parse(f)
}

func filterByMonth(lines []reconciliation.ParsedLine, year, month int) []reconciliation.ParsedLine {
	var out []reconciliation.ParsedLine
	for _, l := range lines {
		if l.TxnDate.Year() == year && int(l.TxnDate.Month()) == month {
			out = append(out, l)
		}
	}
	return out
}

func filterGLByMonth(lines []reconciliation.LedgerLine, year, month int) []reconciliation.LedgerLine {
	var out []reconciliation.LedgerLine
	for _, l := range lines {
		if l.TxnDate.Year() == year && int(l.TxnDate.Month()) == month {
			out = append(out, l)
		}
	}
	return out
}

// computeOpening returns the last balance before the start of the given month.
func computeOpening(lines []reconciliation.ParsedLine, year, month int) int64 {
	cutoff := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	var last int64
	for _, l := range lines {
		if l.TxnDate.Before(cutoff) && l.BalanceKobo != nil {
			last = *l.BalanceKobo
		}
	}
	return last
}

// computeClosing returns the last balance in the given month.
func computeClosing(lines []reconciliation.ParsedLine, year, month int) int64 {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	var last int64
	for _, l := range lines {
		if !l.TxnDate.Before(start) && l.TxnDate.Before(end) && l.BalanceKobo != nil {
			last = *l.BalanceKobo
		}
	}
	return last
}

type statementResult struct {
	id uuid.UUID
}

// insertBankStatement creates the bank_statement header + all lines directly.
func insertBankStatement(
	ctx context.Context,
	pool *pgxpool.Pool,
	bankAccountID, importedBy uuid.UUID,
	periodStart, periodEnd time.Time,
	openingBalance, closingBalance int64,
	lines []reconciliation.ParsedLine,
) (statementResult, error) {
	var stmtID uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO reconciliation.bank_statement
		    (bank_account_id, period_start, period_end, opening_balance, closing_balance, imported_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, bankAccountID,
		pgtype.Date{Time: periodStart, Valid: true},
		pgtype.Date{Time: periodEnd, Valid: true},
		openingBalance, closingBalance, importedBy,
	).Scan(&stmtID)
	if err != nil {
		return statementResult{}, fmt.Errorf("create bank statement: %w", err)
	}

	for _, pl := range lines {
		vd := pgtype.Date{}
		if pl.ValueDate != nil {
			vd = pgtype.Date{Time: *pl.ValueDate, Valid: true}
		}
		var balKobo *int64
		if pl.BalanceKobo != nil {
			b := *pl.BalanceKobo
			balKobo = &b
		}
		raw := pl.Raw
		if len(raw) > 500 {
			raw = raw[:500]
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO reconciliation.bank_statement_line
			    (statement_id, txn_date, value_date, debit_kobo, credit_kobo, balance_kobo,
			     narration, reference, raw)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, stmtID,
			pgtype.Date{Time: pl.TxnDate, Valid: true},
			vd, pl.DebitKobo, pl.CreditKobo, balKobo,
			pl.Narration, pl.Reference, raw)
		if err != nil {
			return statementResult{}, fmt.Errorf("insert bank line: %w", err)
		}
	}
	return statementResult{id: stmtID}, nil
}

// insertGLLines inserts LedgerLines as internal_transaction rows.
func insertGLLines(
	ctx context.Context,
	pool *pgxpool.Pool,
	bankAccountID uuid.UUID,
	subsidiaryID uuid.UUID,
	lines []reconciliation.LedgerLine,
) (int, error) {
	count := 0
	for _, l := range lines {
		ref := l.Reference
		if ref == "" {
			ref = l.Description
		}
		if len(ref) > 200 {
			ref = ref[:200]
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO reconciliation.internal_transaction
			    (subsidiary_id, bank_account_id, type, direction, amount_kobo,
			     currency, reference, txn_date)
			VALUES ($1,$2,'gl_export',$3,$4,'NGN',$5,$6)
			ON CONFLICT DO NOTHING
		`, subsidiaryID, bankAccountID, l.Direction, l.AmountKobo, ref,
			pgtype.Date{Time: l.TxnDate, Valid: true})
		if err != nil {
			return count, fmt.Errorf("insert GL line: %w", err)
		}
		count++
	}
	return count, nil
}
