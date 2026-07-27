// Package reconciliation matches bank statement lines against the internal
// transaction ledger, surfacing discrepancies for human review.
package reconciliation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/audit"
	"github.com/pagegroup/pageos/internal/reconciliation/store"
	recondb "github.com/pagegroup/pageos/internal/reconciliation/store/gen"
)

// ── Domain types ──────────────────────────────────────────────────────────────

type BankAccount struct {
	ID              uuid.UUID         `json:"id"`
	SubsidiaryID    uuid.UUID         `json:"subsidiary_id"`
	BankName        string            `json:"bank_name"`
	AccountNumber   string            `json:"account_number"`
	AccountName     string            `json:"account_name"`
	Currency        string            `json:"currency"`
	ParserColumnMap map[string]string `json:"parser_column_map"`
	Status          string            `json:"status"`
}

type BankStatement struct {
	ID             uuid.UUID `json:"id"`
	BankAccountID  uuid.UUID `json:"bank_account_id"`
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
	OpeningBalance int64     `json:"opening_balance"`
	ClosingBalance int64     `json:"closing_balance"`
	Status         string    `json:"status"`
	ImportedBy     uuid.UUID `json:"imported_by"`
}

type StatementLine struct {
	ID          uuid.UUID  `json:"id"`
	StatementID uuid.UUID  `json:"statement_id"`
	TxnDate     time.Time  `json:"txn_date"`
	ValueDate   *time.Time `json:"value_date,omitempty"`
	DebitKobo   int64      `json:"debit_kobo"`
	CreditKobo  int64      `json:"credit_kobo"`
	BalanceKobo *int64     `json:"balance_kobo,omitempty"`
	Narration   string     `json:"narration"`
	Reference   string     `json:"reference"`
}

type InternalTransaction struct {
	ID            uuid.UUID  `json:"id"`
	SubsidiaryID  uuid.UUID  `json:"subsidiary_id"`
	BankAccountID *uuid.UUID `json:"bank_account_id,omitempty"`
	Type          string     `json:"type"`
	Direction     string     `json:"direction"`
	AmountKobo    int64      `json:"amount_kobo"`
	Currency      string     `json:"currency"`
	Reference     string     `json:"reference"`
	ClientID      *uuid.UUID `json:"client_id,omitempty"`
	TxnDate       time.Time  `json:"txn_date"`
}

type ReconciliationRun struct {
	ID            uuid.UUID  `json:"id"`
	BankAccountID uuid.UUID  `json:"bank_account_id"`
	PeriodStart   time.Time  `json:"period_start"`
	PeriodEnd     time.Time  `json:"period_end"`
	Status        string     `json:"status"`
	ReconciledBy  *uuid.UUID `json:"reconciled_by,omitempty"`
}

type Match struct {
	ID            uuid.UUID  `json:"id"`
	RunID         uuid.UUID  `json:"run_id"`
	BankLineID    *uuid.UUID `json:"bank_line_id,omitempty"`
	InternalTxnID *uuid.UUID `json:"internal_txn_id,omitempty"`
	Status        string     `json:"status"`
	MatchType     string     `json:"match_type"`
	ConfidencePct *int32     `json:"confidence_pct,omitempty"`
	Notes         string     `json:"notes"`
}

type RunSummary struct {
	Matched           int64 `json:"matched"`
	UnmatchedBank     int64 `json:"unmatched_bank"`
	UnmatchedInternal int64 `json:"unmatched_internal"`
	TotalBankLines    int64 `json:"total_bank_lines"`
	TotalInternalTxns int64 `json:"total_internal_txns"`
}

type RunDetails struct {
	Run     ReconciliationRun `json:"run"`
	Summary RunSummary        `json:"summary"`
	Matches []Match           `json:"matches"`
}

type UnmatchedItems struct {
	BankLines    []StatementLine       `json:"bank_lines"`
	InternalTxns []InternalTransaction `json:"internal_txns"`
}

var ErrRunClosed = errors.New("reconciliation: run is closed")
var ErrOpenUnmatched = errors.New("reconciliation: run has unmatched items — resolve before closing")

// FullMatchRow is re-exported from store for use by the HTTP layer.
type FullMatchRow = store.FullMatchRow

// ── Service ───────────────────────────────────────────────────────────────────

type Service struct {
	store   *store.Store
	audit   *audit.Writer
	matcher MatchingStrategy
}

func NewService(db *pgxpool.Pool, a *audit.Writer) *Service {
	return &Service{store: store.New(db), audit: a, matcher: ExactMatcher{}}
}

// ── Bank accounts ─────────────────────────────────────────────────────────────

func (s *Service) CreateBankAccount(ctx context.Context, subsidiaryID uuid.UUID, bankName, accountNumber, accountName, currency string, colMap map[string]string) (BankAccount, error) {
	colMapJSON := []byte("{}")
	if len(colMap) > 0 {
		colMapJSON, _ = json.Marshal(colMap)
	}
	row, err := s.store.CreateBankAccount(ctx, recondb.CreateBankAccountParams{
		SubsidiaryID:    subsidiaryID,
		BankName:        bankName,
		AccountNumber:   accountNumber,
		AccountName:     accountName,
		Currency:        currency,
		ParserColumnMap: colMapJSON,
	})
	if err != nil {
		return BankAccount{}, fmt.Errorf("reconciliation: create bank account: %w", err)
	}
	return toBankAccount(row), nil
}

func (s *Service) ListBankAccounts(ctx context.Context, subsidiaryID uuid.UUID) ([]BankAccount, error) {
	rows, err := s.store.ListBankAccounts(ctx, subsidiaryID)
	if err != nil {
		return nil, err
	}
	out := make([]BankAccount, 0, len(rows))
	for _, r := range rows {
		out = append(out, toBankAccount(r))
	}
	return out, nil
}

// ── Ledger upload + parse ─────────────────────────────────────────────────────

// UploadLedger parses a GL ledger export and stores each row as an
// internal_transaction. The parser is injected so any accounting system's
// export format can be handled without touching this method.
func (s *Service) UploadLedger(ctx context.Context, bankAccountID, uploadedBy uuid.UUID, subsidiaryID uuid.UUID, p LedgerParser, r io.Reader) (int, error) {
	lines, err := p.Parse(r)
	if err != nil {
		return 0, fmt.Errorf("reconciliation: parse ledger: %w", err)
	}

	count := 0
	for _, l := range lines {
		relatedType := "gl_ledger"
		_, err := s.store.CreateInternalTransaction(ctx, recondb.CreateInternalTransactionParams{
			SubsidiaryID:  subsidiaryID,
			BankAccountID: &bankAccountID,
			Type:          "ledger_entry",
			Direction:     l.Direction,
			AmountKobo:    l.AmountKobo,
			Currency:      "NGN",
			Reference:     l.Reference,
			RelatedType:   &relatedType,
			TxnDate:       toPGDate(l.TxnDate),
		})
		if err != nil {
			return count, fmt.Errorf("reconciliation: insert ledger line %q: %w", l.Reference, err)
		}
		count++
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: uploadedBy.String()},
		Action:       "reconciliation.ledger.uploaded",
		ResourceType: "bank_account", ResourceID: bankAccountID.String(),
		Context: map[string]any{"rows": count},
	})
	return count, nil
}

// ── Statement upload + parse ──────────────────────────────────────────────────

// UploadStatement parses a bank statement file (CSV or Excel) and stores lines.
// format: "csv" (default) or "excel" — auto-detect from filename extension recommended.
func (s *Service) UploadStatement(ctx context.Context, bankAccountID, importedBy uuid.UUID, periodStart, periodEnd time.Time, openingBalance, closingBalance int64, format string, r io.Reader) (BankStatement, error) {
	acct, err := s.store.GetBankAccount(ctx, bankAccountID)
	if err != nil {
		return BankStatement{}, fmt.Errorf("reconciliation: bank account not found: %w", err)
	}

	var colMap map[string]string
	_ = json.Unmarshal(acct.ParserColumnMap, &colMap)

	var sp StatementParser
	if format == "excel" {
		sp = &ExcelStatementParser{ColMap: colMap}
	} else {
		sp = &CSVParser{ColMap: colMap}
	}
	parsed, err := sp.Parse(r)
	if err != nil {
		return BankStatement{}, fmt.Errorf("reconciliation: parse statement: %w", err)
	}

	stmt, err := s.store.CreateBankStatement(ctx, recondb.CreateBankStatementParams{
		BankAccountID:  bankAccountID,
		PeriodStart:    toPGDate(periodStart),
		PeriodEnd:      toPGDate(periodEnd),
		OpeningBalance: openingBalance,
		ClosingBalance: closingBalance,
		ImportedBy:     importedBy,
	})
	if err != nil {
		return BankStatement{}, fmt.Errorf("reconciliation: create statement: %w", err)
	}

	for _, pl := range parsed {
		vd := pgtype.Date{}
		if pl.ValueDate != nil {
			vd = toPGDate(*pl.ValueDate)
		}
		_, err := s.store.CreateBankStatementLine(ctx, recondb.CreateBankStatementLineParams{
			StatementID: stmt.ID,
			TxnDate:     toPGDate(pl.TxnDate),
			ValueDate:   vd,
			DebitKobo:   pl.DebitKobo,
			CreditKobo:  pl.CreditKobo,
			BalanceKobo: pl.BalanceKobo,
			Narration:   pl.Narration,
			Reference:   pl.Reference,
			Raw:         pl.Raw,
		})
		if err != nil {
			return BankStatement{}, fmt.Errorf("reconciliation: insert line: %w", err)
		}
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: importedBy.String()},
		Action: "reconciliation.statement.uploaded",
		ResourceType: "bank_statement", ResourceID: stmt.ID.String(),
		Context: map[string]any{"lines": len(parsed)},
	})
	return toStatement(stmt), nil
}

func (s *Service) ListStatements(ctx context.Context, bankAccountID uuid.UUID) ([]BankStatement, error) {
	rows, err := s.store.ListBankStatements(ctx, bankAccountID)
	if err != nil {
		return nil, err
	}
	out := make([]BankStatement, 0, len(rows))
	for _, r := range rows {
		out = append(out, toStatement(r))
	}
	return out, nil
}

// ── Internal transactions ─────────────────────────────────────────────────────

func (s *Service) CreateInternalTransaction(ctx context.Context, subsidiaryID uuid.UUID, bankAccountID *uuid.UUID, txnType, direction string, amountKobo int64, currency, reference string, clientID *uuid.UUID, txnDate time.Time) (InternalTransaction, error) {
	row, err := s.store.CreateInternalTransaction(ctx, recondb.CreateInternalTransactionParams{
		SubsidiaryID:  subsidiaryID,
		BankAccountID: bankAccountID,
		Type:          txnType,
		Direction:     direction,
		AmountKobo:    amountKobo,
		Currency:      currency,
		Reference:     reference,
		ClientID:      clientID,
		TxnDate:       toPGDate(txnDate),
	})
	if err != nil {
		return InternalTransaction{}, fmt.Errorf("reconciliation: create internal transaction: %w", err)
	}
	return toInternalTxn(row), nil
}

// ── Runs ──────────────────────────────────────────────────────────────────────

// CreateRun opens a new reconciliation run and immediately runs auto-matching.
func (s *Service) CreateRun(ctx context.Context, bankAccountID, userID uuid.UUID, periodStart, periodEnd time.Time) (ReconciliationRun, error) {
	row, err := s.store.CreateReconciliationRun(ctx, recondb.CreateReconciliationRunParams{
		BankAccountID: bankAccountID,
		PeriodStart:   toPGDate(periodStart),
		PeriodEnd:     toPGDate(periodEnd),
	})
	if err != nil {
		return ReconciliationRun{}, fmt.Errorf("reconciliation: create run: %w", err)
	}
	run := toRun(row)

	// Auto-match immediately after creating the run.
	if _, err := s.AutoMatch(ctx, run.ID, userID); err != nil {
		// Non-fatal: log but don't fail the run creation.
		_ = s.audit.Write(ctx, audit.Entry{
			Actor: audit.Actor{Type: "system"}, Action: "reconciliation.auto_match.failed",
			ResourceType: "reconciliation_run", ResourceID: run.ID.String(),
			Context: map[string]any{"error": err.Error()},
		})
	}

	return run, nil
}

// AutoMatch runs the exact-match strategy and records all results as Match rows.
func (s *Service) AutoMatch(ctx context.Context, runID, userID uuid.UUID) ([]Match, error) {
	bankLineRows, err := s.store.GetUnmatchedBankLines(ctx, runID)
	if err != nil {
		return nil, err
	}
	txnRows, err := s.store.GetUnmatchedInternalTxns(ctx, runID)
	if err != nil {
		return nil, err
	}

	lines := make([]StatementLine, 0, len(bankLineRows))
	for _, r := range bankLineRows {
		lines = append(lines, toLine(r))
	}
	txns := make([]InternalTransaction, 0, len(txnRows))
	for _, r := range txnRows {
		txns = append(txns, toInternalTxn(r))
	}

	results := s.matcher.Match(lines, txns)

	// Track which txns got matched, so we can create unmatched_internal rows.
	matchedTxns := make(map[uuid.UUID]bool)
	var matches []Match
	actor := &userID

	for _, res := range results {
		pct := int32(res.ConfidencePct)
		var status, matchType string
		if res.InternalTxnID != nil {
			status = "matched"
			matchType = "auto"
			matchedTxns[*res.InternalTxnID] = true
		} else {
			status = "unmatched_bank"
			matchType = "auto"
		}
		m, err := s.store.CreateMatch(ctx, recondb.CreateMatchParams{
			RunID:         runID,
			BankLineID:    &res.BankLineID,
			InternalTxnID: res.InternalTxnID,
			Status:        status,
			MatchType:     matchType,
			ConfidencePct: &pct,
			MatchedBy:     actor,
			Notes:         "",
		})
		if err != nil {
			return nil, fmt.Errorf("reconciliation: record match: %w", err)
		}
		matches = append(matches, toMatch(m))
	}

	// Create unmatched_internal rows for txns that had no bank line.
	for _, txn := range txns {
		if matchedTxns[txn.ID] {
			continue
		}
		pct := int32(0)
		m, err := s.store.CreateMatch(ctx, recondb.CreateMatchParams{
			RunID:         runID,
			BankLineID:    nil,
			InternalTxnID: &txn.ID,
			Status:        "unmatched_internal",
			MatchType:     "auto",
			ConfidencePct: &pct,
			MatchedBy:     actor,
			Notes:         "",
		})
		if err != nil {
			return nil, fmt.Errorf("reconciliation: record unmatched internal: %w", err)
		}
		matches = append(matches, toMatch(m))
	}

	return matches, nil
}

func (s *Service) GetRunDetails(ctx context.Context, runID uuid.UUID) (RunDetails, error) {
	row, err := s.store.GetReconciliationRun(ctx, runID)
	if err != nil {
		return RunDetails{}, fmt.Errorf("reconciliation: run not found: %w", err)
	}
	sumRow, err := s.store.GetRunSummary(ctx, runID)
	if err != nil {
		return RunDetails{}, err
	}
	matchRows, err := s.store.ListMatches(ctx, runID)
	if err != nil {
		return RunDetails{}, err
	}
	matches := make([]Match, 0, len(matchRows))
	for _, m := range matchRows {
		matches = append(matches, toMatch(m))
	}
	return RunDetails{
		Run:     toRun(row),
		Summary: RunSummary(sumRow),
		Matches: matches,
	}, nil
}

func (s *Service) ListRuns(ctx context.Context, bankAccountID uuid.UUID) ([]ReconciliationRun, error) {
	rows, err := s.store.ListReconciliationRuns(ctx, bankAccountID)
	if err != nil {
		return nil, err
	}
	out := make([]ReconciliationRun, 0, len(rows))
	for _, r := range rows {
		out = append(out, toRun(r))
	}
	return out, nil
}

func (s *Service) ListUnmatched(ctx context.Context, runID uuid.UUID) (UnmatchedItems, error) {
	lineRows, err := s.store.GetUnmatchedBankLines(ctx, runID)
	if err != nil {
		return UnmatchedItems{}, err
	}
	txnRows, err := s.store.GetUnmatchedInternalTxns(ctx, runID)
	if err != nil {
		return UnmatchedItems{}, err
	}
	lines := make([]StatementLine, 0, len(lineRows))
	for _, r := range lineRows {
		lines = append(lines, toLine(r))
	}
	txns := make([]InternalTransaction, 0, len(txnRows))
	for _, r := range txnRows {
		txns = append(txns, toInternalTxn(r))
	}
	return UnmatchedItems{BankLines: lines, InternalTxns: txns}, nil
}

// RecordManualMatch links one bank line to one internal transaction.
func (s *Service) RecordManualMatch(ctx context.Context, runID, bankLineID, internalTxnID, userID uuid.UUID, notes string) (Match, error) {
	pct := int32(100)
	m, err := s.store.CreateMatch(ctx, recondb.CreateMatchParams{
		RunID:         runID,
		BankLineID:    &bankLineID,
		InternalTxnID: &internalTxnID,
		Status:        "matched",
		MatchType:     "manual",
		ConfidencePct: &pct,
		MatchedBy:     &userID,
		Notes:         notes,
	})
	if err != nil {
		return Match{}, fmt.Errorf("reconciliation: record manual match: %w", err)
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: userID.String()},
		Action: "reconciliation.match.manual",
		ResourceType: "reconciliation_run", ResourceID: runID.String(),
		Context: map[string]any{"bank_line_id": bankLineID.String(), "internal_txn_id": internalTxnID.String()},
	})
	return toMatch(m), nil
}

// MarkBankLineUnmatched explicitly marks a bank line as having no internal counterpart.
func (s *Service) MarkBankLineUnmatched(ctx context.Context, runID, bankLineID, userID uuid.UUID, notes string) (Match, error) {
	pct := int32(0)
	m, err := s.store.CreateMatch(ctx, recondb.CreateMatchParams{
		RunID: runID, BankLineID: &bankLineID,
		Status: "unmatched_bank", MatchType: "manual",
		ConfidencePct: &pct, MatchedBy: &userID, Notes: notes,
	})
	if err != nil {
		return Match{}, fmt.Errorf("reconciliation: mark bank line unmatched: %w", err)
	}
	return toMatch(m), nil
}

// MarkInternalTxnUnmatched explicitly marks an internal txn as having no bank counterpart.
func (s *Service) MarkInternalTxnUnmatched(ctx context.Context, runID, internalTxnID, userID uuid.UUID, notes string) (Match, error) {
	pct := int32(0)
	m, err := s.store.CreateMatch(ctx, recondb.CreateMatchParams{
		RunID: runID, InternalTxnID: &internalTxnID,
		Status: "unmatched_internal", MatchType: "manual",
		ConfidencePct: &pct, MatchedBy: &userID, Notes: notes,
	})
	if err != nil {
		return Match{}, fmt.Errorf("reconciliation: mark internal txn unmatched: %w", err)
	}
	return toMatch(m), nil
}

// UnmatchRecord breaks an existing matched pair back into two unmatched items.
// After calling this, the bank line and internal txn are independently visible
// in the unmatched view, ready for re-matching or manual disposition.
func (s *Service) UnmatchRecord(ctx context.Context, runID, matchID, userID uuid.UUID) error {
	// Fetch the existing match to get the bank_line_id and internal_txn_id
	matches, err := s.store.ListMatches(ctx, runID)
	if err != nil {
		return fmt.Errorf("reconciliation: unmatch: list matches: %w", err)
	}
	var bankLineID, internalTxnID *uuid.UUID
	for _, m := range matches {
		if m.ID == matchID {
			bankLineID   = m.BankLineID
			internalTxnID = m.InternalTxnID
			break
		}
	}
	if bankLineID == nil && internalTxnID == nil {
		return fmt.Errorf("reconciliation: unmatch: match not found")
	}

	// Delete the existing match
	_, err = s.store.Pool().Exec(ctx,
		"DELETE FROM reconciliation.reconciliation_match WHERE id = $1", matchID)
	if err != nil {
		return fmt.Errorf("reconciliation: unmatch: delete: %w", err)
	}

	pct := int32(0)
	actor := &userID

	// Re-create as unmatched_bank if there was a bank line
	if bankLineID != nil {
		_, _ = s.store.CreateMatch(ctx, recondb.CreateMatchParams{
			RunID:         runID,
			BankLineID:    bankLineID,
			InternalTxnID: nil,
			Status:        "unmatched_bank",
			MatchType:     "manual",
			ConfidencePct: &pct,
			MatchedBy:     actor,
			Notes:         "unmatched by user",
		})
	}

	// Re-create as unmatched_internal if there was a ledger txn
	if internalTxnID != nil {
		_, _ = s.store.CreateMatch(ctx, recondb.CreateMatchParams{
			RunID:         runID,
			BankLineID:    nil,
			InternalTxnID: internalTxnID,
			Status:        "unmatched_internal",
			MatchType:     "manual",
			ConfidencePct: &pct,
			MatchedBy:     actor,
			Notes:         "unmatched by user",
		})
	}

	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "reconciliation.match.unmatched",
		ResourceType: "reconciliation_run", ResourceID: runID.String(),
		Context: map[string]any{"match_id": matchID.String()},
	})
	return nil
}

// GetRunFullView returns all matches for a run with bank line and ledger
// transaction details joined together. Used by the reconciliation UI.
func (s *Service) GetRunFullView(ctx context.Context, runID uuid.UUID) ([]FullMatchRow, error) {
	rows, err := s.store.GetRunFullView(ctx, runID)
	if err != nil {
		return nil, fmt.Errorf("reconciliation: get run full view: %w", err)
	}
	return rows, nil
}

// CloseRun seals the run. Fails if any items remain genuinely unresolved.
func (s *Service) CloseRun(ctx context.Context, runID, userID uuid.UUID) (ReconciliationRun, error) {
	sum, err := s.store.GetRunSummary(ctx, runID)
	if err != nil {
		return ReconciliationRun{}, err
	}
	if sum.UnmatchedBank+sum.UnmatchedInternal > 0 {
		return ReconciliationRun{}, ErrOpenUnmatched
	}
	now := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	row, err := s.store.UpdateRunStatus(ctx, recondb.UpdateRunStatusParams{
		ID: runID, Status: "closed", ReconciledBy: &userID, ReconciledAt: now,
	})
	if err != nil {
		return ReconciliationRun{}, fmt.Errorf("reconciliation: close run: %w", err)
	}
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "user", ID: userID.String()},
		Action: "reconciliation.run.closed",
		ResourceType: "reconciliation_run", ResourceID: runID.String(),
	})
	return toRun(row), nil
}

// ── type mappings ─────────────────────────────────────────────────────────────

func toBankAccount(r recondb.ReconciliationBankAccount) BankAccount {
	a := BankAccount{
		ID: r.ID, SubsidiaryID: r.SubsidiaryID, BankName: r.BankName,
		AccountNumber: r.AccountNumber, AccountName: r.AccountName,
		Currency: r.Currency, Status: r.Status,
	}
	_ = json.Unmarshal(r.ParserColumnMap, &a.ParserColumnMap)
	return a
}

func toStatement(r recondb.ReconciliationBankStatement) BankStatement {
	return BankStatement{
		ID: r.ID, BankAccountID: r.BankAccountID,
		PeriodStart: r.PeriodStart.Time, PeriodEnd: r.PeriodEnd.Time,
		OpeningBalance: r.OpeningBalance, ClosingBalance: r.ClosingBalance,
		Status: r.Status, ImportedBy: r.ImportedBy,
	}
}

func toLine(r recondb.ReconciliationBankStatementLine) StatementLine {
	l := StatementLine{
		ID: r.ID, StatementID: r.StatementID,
		TxnDate: r.TxnDate.Time,
		DebitKobo: r.DebitKobo, CreditKobo: r.CreditKobo,
		BalanceKobo: r.BalanceKobo, Narration: r.Narration, Reference: r.Reference,
	}
	if r.ValueDate.Valid {
		t := r.ValueDate.Time
		l.ValueDate = &t
	}
	return l
}

func toInternalTxn(r recondb.ReconciliationInternalTransaction) InternalTransaction {
	t := InternalTransaction{
		ID: r.ID, SubsidiaryID: r.SubsidiaryID, BankAccountID: r.BankAccountID,
		Type: r.Type, Direction: r.Direction, AmountKobo: r.AmountKobo,
		Currency: r.Currency, Reference: r.Reference, ClientID: r.ClientID,
		TxnDate: r.TxnDate.Time,
	}
	return t
}

func toRun(r recondb.ReconciliationReconciliationRun) ReconciliationRun {
	return ReconciliationRun{
		ID: r.ID, BankAccountID: r.BankAccountID,
		PeriodStart: r.PeriodStart.Time, PeriodEnd: r.PeriodEnd.Time,
		Status: r.Status, ReconciledBy: r.ReconciledBy,
	}
}

func toMatch(r recondb.ReconciliationReconciliationMatch) Match {
	return Match{
		ID: r.ID, RunID: r.RunID, BankLineID: r.BankLineID,
		InternalTxnID: r.InternalTxnID, Status: r.Status, MatchType: r.MatchType,
		ConfidencePct: r.ConfidencePct, Notes: r.Notes,
	}
}

func toPGDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}
