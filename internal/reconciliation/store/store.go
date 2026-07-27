package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	recondb "github.com/pagegroup/pageos/internal/reconciliation/store/gen"
)

type Store struct {
	*recondb.Queries
	pool *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: recondb.New(db), pool: db}
}

// Pool exposes the underlying pgxpool for operations that go beyond sqlc queries.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// FullMatchRow is a denormalised view of a reconciliation match with both
// bank statement line details and internal transaction details joined in.
// Used by the frontend to render the side-by-side match table.
type FullMatchRow struct {
	MatchID       uuid.UUID  `json:"match_id"`
	Status        string     `json:"status"`
	MatchType     string     `json:"match_type"`
	ConfidencePct *int32     `json:"confidence_pct,omitempty"`
	Notes         string     `json:"notes"`

	// Bank side (nil when status = unmatched_internal)
	BankLineID     *uuid.UUID `json:"bank_line_id,omitempty"`
	BankDate       *string    `json:"bank_date,omitempty"`
	BankNarration  string     `json:"bank_narration,omitempty"`
	BankDebitKobo  int64      `json:"bank_debit_kobo,omitempty"`
	BankCreditKobo int64      `json:"bank_credit_kobo,omitempty"`
	BankReference  string     `json:"bank_reference,omitempty"`

	// Ledger side (nil when status = unmatched_bank)
	LedgerTxnID      *uuid.UUID `json:"ledger_txn_id,omitempty"`
	LedgerDate       *string    `json:"ledger_date,omitempty"`
	LedgerType       string     `json:"ledger_type,omitempty"`
	LedgerDirection  string     `json:"ledger_direction,omitempty"`
	LedgerAmountKobo int64      `json:"ledger_amount_kobo,omitempty"`
	LedgerReference  string     `json:"ledger_reference,omitempty"`
}

// GetRunFullView returns all matches for a run with bank line and ledger
// transaction details joined in a single query — used by the reconciliation UI.
func (s *Store) GetRunFullView(ctx context.Context, runID uuid.UUID) ([]FullMatchRow, error) {
	// The subquery filters out stale "unmatched" records for any bank line or
	// internal txn that already has a "matched" record in this run. This prevents
	// duplicate rows appearing after a manual match replaces auto-detected unmatch.
	const q = `
		SELECT
			m.id                                          AS match_id,
			m.status,
			m.match_type,
			m.confidence_pct,
			m.notes,

			bl.id                                         AS bank_line_id,
			bl.txn_date::text                             AS bank_date,
			COALESCE(bl.narration,   '')                  AS bank_narration,
			COALESCE(bl.debit_kobo,  0)                   AS bank_debit_kobo,
			COALESCE(bl.credit_kobo, 0)                   AS bank_credit_kobo,
			COALESCE(bl.reference,   '')                  AS bank_reference,

			it.id                                         AS ledger_txn_id,
			it.txn_date::text                             AS ledger_date,
			COALESCE(it.type,        '')                  AS ledger_type,
			COALESCE(it.direction,   '')                  AS ledger_direction,
			COALESCE(it.amount_kobo, 0)                   AS ledger_amount_kobo,
			COALESCE(it.reference,   '')                  AS ledger_reference

		FROM reconciliation.reconciliation_match m
		LEFT JOIN reconciliation.bank_statement_line bl ON bl.id = m.bank_line_id
		LEFT JOIN reconciliation.internal_transaction it ON it.id = m.internal_txn_id
		WHERE m.run_id = $1
		  AND NOT (
		      m.status = 'unmatched_bank'
		      AND EXISTS (
		          SELECT 1 FROM reconciliation.reconciliation_match mx
		          WHERE mx.run_id = $1 AND mx.bank_line_id = m.bank_line_id
		            AND mx.status = 'matched'
		      )
		  )
		  AND NOT (
		      m.status = 'unmatched_internal'
		      AND EXISTS (
		          SELECT 1 FROM reconciliation.reconciliation_match mx
		          WHERE mx.run_id = $1 AND mx.internal_txn_id = m.internal_txn_id
		            AND mx.status = 'matched'
		      )
		  )
		ORDER BY
			COALESCE(bl.txn_date, it.txn_date),
			m.status,
			m.created_at
	`
	rows, err := s.pool.Query(ctx, q, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FullMatchRow
	for rows.Next() {
		var r FullMatchRow
		var bankDate, ledgerDate *string
		if err := rows.Scan(
			&r.MatchID, &r.Status, &r.MatchType, &r.ConfidencePct, &r.Notes,
			&r.BankLineID, &bankDate, &r.BankNarration, &r.BankDebitKobo, &r.BankCreditKobo, &r.BankReference,
			&r.LedgerTxnID, &ledgerDate, &r.LedgerType, &r.LedgerDirection, &r.LedgerAmountKobo, &r.LedgerReference,
		); err != nil {
			return nil, err
		}
		if bankDate != nil {
			s := (*bankDate)[:10] // keep YYYY-MM-DD
			r.BankDate = &s
		}
		if ledgerDate != nil {
			s := (*ledgerDate)[:10]
			r.LedgerDate = &s
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// OrgPositionNode is the flattened row returned by GetOrgChart raw query.
type OrgPositionNode struct {
	ID                  uuid.UUID  `json:"id"`
	Code                string     `json:"code"`
	Title               string     `json:"title"`
	SubsidiaryID        *uuid.UUID `json:"subsidiary_id,omitempty"`
	ReportsToPositionID *uuid.UUID `json:"reports_to_position_id,omitempty"`
	HolderNames         []string   `json:"holder_names"` // current holders (may be empty)
}

// dummy reference to keep time import used
var _ = time.Now
