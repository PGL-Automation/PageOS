// Package finance manages the general ledger: journal headers, lines, and
// the post / reverse lifecycle.
package finance

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/notification"
)

// Service owns all finance business logic and runs raw SQL directly.
type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// ── Domain types ──────────────────────────────────────────────────────────────

type JournalHeader struct {
	ID             uuid.UUID  `json:"id"`
	SubsidiaryID   *uuid.UUID `json:"subsidiary_id,omitempty"`
	SubsidiaryName string     `json:"subsidiary_name,omitempty"`
	Reference      string     `json:"reference"`
	Date           string     `json:"date"`
	Type           string     `json:"type"`
	Description    string     `json:"description"`
	Status         string     `json:"status"`
	DebitTotal     float64    `json:"debit_total"`
	CreditTotal    float64    `json:"credit_total"`
	LineCount      int        `json:"line_count"`
	CreatedBy      uuid.UUID  `json:"created_by"`
	CreatedByName  string     `json:"created_by_name"`
	PostedBy       *uuid.UUID `json:"posted_by,omitempty"`
	PostedAt       *time.Time `json:"posted_at,omitempty"`
	ReversedBy     *uuid.UUID `json:"reversed_by,omitempty"`
	ReversedAt     *time.Time `json:"reversed_at,omitempty"`
	ReversalOf     *uuid.UUID `json:"reversal_of,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type JournalLine struct {
	ID          uuid.UUID `json:"id"`
	JournalID   uuid.UUID `json:"journal_id"`
	LineNumber  int       `json:"line_number"`
	AccountCode string    `json:"account_code"`
	AccountName string    `json:"account_name"`
	Narration   string    `json:"narration"`
	Debit       float64   `json:"debit"`
	Credit      float64   `json:"credit"`
}

type JournalWithLines struct {
	JournalHeader
	Lines []JournalLine `json:"lines"`
}

type JournalLineInput struct {
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Narration   string  `json:"narration"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

type CreateJournalInput struct {
	SubsidiaryID *uuid.UUID         `json:"subsidiary_id"`
	Date         string             `json:"date"`
	Type         string             `json:"type"`
	Description  string             `json:"description"`
	Lines        []JournalLineInput `json:"lines"`
}

// ── Shared header query ───────────────────────────────────────────────────────

const headerSelect = `
	SELECT h.id, h.subsidiary_id, COALESCE(sub.name,'') AS subsidiary_name,
	       h.reference, h.date::text, h.type, h.description, h.status,
	       h.debit_total::float8, h.credit_total::float8, h.line_count,
	       h.created_by, h.created_by_name,
	       h.posted_by, h.posted_at, h.reversed_by, h.reversed_at, h.reversal_of,
	       h.created_at
	FROM   finance.journal_header h
	LEFT   JOIN organization.subsidiary sub ON sub.id = h.subsidiary_id
`

func scanHeader(row pgx.Row) (JournalHeader, error) {
	var h JournalHeader
	err := row.Scan(
		&h.ID, &h.SubsidiaryID, &h.SubsidiaryName,
		&h.Reference, &h.Date, &h.Type, &h.Description, &h.Status,
		&h.DebitTotal, &h.CreditTotal, &h.LineCount,
		&h.CreatedBy, &h.CreatedByName,
		&h.PostedBy, &h.PostedAt, &h.ReversedBy, &h.ReversedAt, &h.ReversalOf,
		&h.CreatedAt,
	)
	return h, err
}

func scanHeaders(rows pgx.Rows) ([]JournalHeader, error) {
	var out []JournalHeader
	for rows.Next() {
		var h JournalHeader
		if err := rows.Scan(
			&h.ID, &h.SubsidiaryID, &h.SubsidiaryName,
			&h.Reference, &h.Date, &h.Type, &h.Description, &h.Status,
			&h.DebitTotal, &h.CreditTotal, &h.LineCount,
			&h.CreatedBy, &h.CreatedByName,
			&h.PostedBy, &h.PostedAt, &h.ReversedBy, &h.ReversedAt, &h.ReversalOf,
			&h.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ── List ──────────────────────────────────────────────────────────────────────

func (s *Service) ListJournals(ctx context.Context, subsidiaryID *uuid.UUID, status string) ([]JournalHeader, error) {
	q := headerSelect + `
		WHERE  ($1::uuid IS NULL OR h.subsidiary_id = $1)
		  AND  ($2::text = ''    OR h.status        = $2)
		ORDER  BY h.date DESC, h.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanHeaders(rows)
}

// ── Get single with lines ─────────────────────────────────────────────────────

func (s *Service) GetJournal(ctx context.Context, id uuid.UUID) (JournalWithLines, error) {
	jh, err := scanHeader(s.pool.QueryRow(ctx, headerSelect+` WHERE h.id = $1`, id))
	if err != nil {
		return JournalWithLines{}, fmt.Errorf("finance: journal not found: %w", err)
	}
	lines, err := s.getLines(ctx, id)
	if err != nil {
		return JournalWithLines{}, err
	}
	return JournalWithLines{JournalHeader: jh, Lines: lines}, nil
}

func (s *Service) getLines(ctx context.Context, journalID uuid.UUID) ([]JournalLine, error) {
	const q = `
		SELECT id, journal_id, line_number, account_code, account_name,
		       narration, debit::float8, credit::float8
		FROM   finance.journal_line
		WHERE  journal_id = $1
		ORDER  BY line_number
	`
	rows, err := s.pool.Query(ctx, q, journalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []JournalLine
	for rows.Next() {
		var l JournalLine
		if err := rows.Scan(&l.ID, &l.JournalID, &l.LineNumber,
			&l.AccountCode, &l.AccountName, &l.Narration, &l.Debit, &l.Credit); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *Service) CreateJournal(ctx context.Context, createdByID uuid.UUID, createdByName string, in CreateJournalInput) (JournalHeader, error) {
	if len(in.Lines) < 2 {
		return JournalHeader{}, fmt.Errorf("finance: journal must have at least 2 lines")
	}
	if in.Type == "" {
		return JournalHeader{}, fmt.Errorf("finance: type is required")
	}
	date, err := time.Parse("2006-01-02", in.Date)
	if err != nil {
		return JournalHeader{}, fmt.Errorf("finance: invalid date: %w", err)
	}

	var debitTotal, creditTotal float64
	for i, l := range in.Lines {
		if l.Debit < 0 || l.Credit < 0 {
			return JournalHeader{}, fmt.Errorf("finance: line %d has a negative amount", i+1)
		}
		if l.AccountCode == "" {
			return JournalHeader{}, fmt.Errorf("finance: line %d is missing account code", i+1)
		}
		debitTotal += l.Debit
		creditTotal += l.Credit
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return JournalHeader{}, err
	}
	defer tx.Rollback(ctx)

	// Atomic per-year counter → reference number.
	var seqNum int
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_ref_counter (year, last_seq) VALUES ($1, 1)
		ON CONFLICT (year) DO UPDATE
		  SET last_seq = finance.journal_ref_counter.last_seq + 1
		RETURNING last_seq
	`, date.Year()).Scan(&seqNum); err != nil {
		return JournalHeader{}, fmt.Errorf("finance: generate reference: %w", err)
	}
	ref := fmt.Sprintf("JV/%d/%03d", date.Year(), seqNum)

	// Insert header.
	var journalID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_header
		    (subsidiary_id, reference, date, type, description,
		     debit_total, credit_total, line_count, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id
	`, in.SubsidiaryID, ref, date, in.Type, in.Description,
		debitTotal, creditTotal, len(in.Lines), createdByID, createdByName,
	).Scan(&journalID); err != nil {
		return JournalHeader{}, fmt.Errorf("finance: insert header: %w", err)
	}

	// Insert lines.
	for i, l := range in.Lines {
		if _, err := tx.Exec(ctx, `
			INSERT INTO finance.journal_line
			    (journal_id, line_number, account_code, account_name, narration, debit, credit)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
		`, journalID, i+1, l.AccountCode, l.AccountName, l.Narration, l.Debit, l.Credit,
		); err != nil {
			return JournalHeader{}, fmt.Errorf("finance: insert line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return JournalHeader{}, err
	}

	// Read back the full header (with subsidiary name join).
	return scanHeader(s.pool.QueryRow(ctx, headerSelect+` WHERE h.id = $1`, journalID))
}

// ── Post ──────────────────────────────────────────────────────────────────────

func (s *Service) PostJournal(ctx context.Context, journalID, postedByID uuid.UUID) error {
	var debit, credit float64
	var journalDate time.Time
	if err := s.pool.QueryRow(ctx,
		`SELECT debit_total::float8, credit_total::float8, date FROM finance.journal_header WHERE id = $1`,
		journalID).Scan(&debit, &credit, &journalDate); err != nil {
		return fmt.Errorf("finance: journal not found")
	}
	if math.Abs(debit-credit) > 0.01 {
		return fmt.Errorf("finance: journal is not balanced (debit ₦%.2f ≠ credit ₦%.2f) — cannot post", debit, credit)
	}
	// Enforce period: reject if the period is closed or locked.
	if ps := s.periodStatusForDate(ctx, journalDate); ps == "closed" || ps == "locked" {
		return fmt.Errorf("finance: the accounting period for %s is %s — cannot post", journalDate.Format("January 2006"), ps)
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status = 'posted', posted_by = $1, posted_at = now(), updated_at = now()
		WHERE  id = $2 AND status IN ('draft','pending_approval')
	`, postedByID, journalID)
	if err != nil {
		return fmt.Errorf("finance: post: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("finance: journal not found or already posted/reversed")
	}
	return nil
}

// ── Reverse ───────────────────────────────────────────────────────────────────

func (s *Service) ReverseJournal(ctx context.Context, journalID, byID uuid.UUID, byName string) (JournalHeader, error) {
	original, err := s.GetJournal(ctx, journalID)
	if err != nil {
		return JournalHeader{}, err
	}
	if original.Status != "posted" {
		return JournalHeader{}, fmt.Errorf("finance: only posted journals can be reversed")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return JournalHeader{}, err
	}
	defer tx.Rollback(ctx)

	// Per-year counter for the reversal reference.
	today := time.Now()
	var seqNum int
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_ref_counter (year, last_seq) VALUES ($1, 1)
		ON CONFLICT (year) DO UPDATE
		  SET last_seq = finance.journal_ref_counter.last_seq + 1
		RETURNING last_seq
	`, today.Year()).Scan(&seqNum); err != nil {
		return JournalHeader{}, err
	}
	ref := fmt.Sprintf("JV/%d/%03d", today.Year(), seqNum)
	desc := fmt.Sprintf("Reversal of %s: %s", original.Reference, original.Description)

	// Insert reversal header (immediately posted).
	var reversalID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_header
		    (subsidiary_id, reference, date, type, description,
		     debit_total, credit_total, line_count,
		     created_by, created_by_name, reversal_of,
		     status, posted_by, posted_at)
		VALUES ($1,$2,$3,'Reversal',$4,
		        $5,$6,$7,
		        $8,$9,$10,
		        'posted',$8,now())
		RETURNING id
	`, original.SubsidiaryID, ref, today, desc,
		original.CreditTotal, original.DebitTotal, len(original.Lines),
		byID, byName, journalID,
	).Scan(&reversalID); err != nil {
		return JournalHeader{}, fmt.Errorf("finance: insert reversal: %w", err)
	}

	// Insert mirrored lines (debit ↔ credit swapped).
	for i, l := range original.Lines {
		if _, err := tx.Exec(ctx, `
			INSERT INTO finance.journal_line
			    (journal_id, line_number, account_code, account_name, narration, debit, credit)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
		`, reversalID, i+1, l.AccountCode, l.AccountName,
			"Reversal: "+l.Narration, l.Credit, l.Debit,
		); err != nil {
			return JournalHeader{}, fmt.Errorf("finance: insert reversal line %d: %w", i+1, err)
		}
	}

	// Mark original as reversed.
	if _, err := tx.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status = 'reversed', reversed_by = $1, reversed_at = now(), updated_at = now()
		WHERE  id = $2
	`, byID, journalID); err != nil {
		return JournalHeader{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return JournalHeader{}, err
	}
	return scanHeader(s.pool.QueryRow(ctx, headerSelect+` WHERE h.id = $1`, reversalID))
}

// ── Delete draft ──────────────────────────────────────────────────────────────

func (s *Service) DeleteDraft(ctx context.Context, journalID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM finance.journal_header WHERE id = $1 AND status = 'draft'`, journalID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("finance: journal not found or not a draft")
	}
	return nil
}

// ═════════════════════════════════════════════════════════════════════════════
// Journal Approval Workflow
// ═════════════════════════════════════════════════════════════════════════════

// SubmitForApproval moves a draft journal to pending_approval.
func (s *Service) SubmitForApproval(ctx context.Context, journalID, byID uuid.UUID, byName string) error {
	var ref, desc, subIDStr string
	_ = s.pool.QueryRow(ctx,
		`SELECT reference, COALESCE(description,''), COALESCE(subsidiary_id::text,'')
		 FROM finance.journal_header WHERE id=$1`, journalID,
	).Scan(&ref, &desc, &subIDStr)

	tag, err := s.pool.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status       = 'pending_approval',
		       submitted_by = $1,
		       submitted_at = now(),
		       updated_at   = now()
		WHERE  id     = $2
		  AND  status = 'draft'
	`, byID, journalID)
	if err != nil {
		return fmt.Errorf("finance: submit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("finance: journal not found or not a draft")
	}

	// Notify Finance managers that a journal needs approval.
	subID, _ := uuid.Parse(subIDStr)
	body := fmt.Sprintf("Journal %s — %s has been submitted for approval by %s.", ref, desc, byName)
	if desc == "" {
		body = fmt.Sprintf("Journal %s has been submitted for approval by %s.", ref, byName)
	}
	_ = notification.SendToRole(ctx, s.pool, subID,
		[]string{"FINANCE_MANAGER", "FINANCE_CONTROLLER", "CFO", "MANAGING_DIRECTOR"},
		notification.InApp{
			Type:       "finance_journal_pending",
			Title:      "Journal Awaiting Approval",
			Body:       body,
			Link:       "/finance/journals",
			Priority:   "high",
			EntityType: "journal",
			EntityID:   &journalID,
		})
	return nil
}

// ApproveJournal posts a pending_approval journal (requires authorised approver).
func (s *Service) ApproveJournal(ctx context.Context, journalID, approverID uuid.UUID) error {
	var debit, credit float64
	var journalDate time.Time
	if err := s.pool.QueryRow(ctx,
		`SELECT debit_total::float8, credit_total::float8, date FROM finance.journal_header WHERE id = $1`,
		journalID).Scan(&debit, &credit, &journalDate); err != nil {
		return fmt.Errorf("finance: journal not found")
	}
	if math.Abs(debit-credit) > 0.01 {
		return fmt.Errorf("finance: journal is not balanced — cannot approve")
	}
	if ps := s.periodStatusForDate(ctx, journalDate); ps == "closed" || ps == "locked" {
		return fmt.Errorf("finance: the accounting period for %s is %s", journalDate.Format("January 2006"), ps)
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status      = 'posted',
		       approved_by = $1,
		       approved_at = now(),
		       posted_by   = $1,
		       posted_at   = now(),
		       updated_at  = now()
		WHERE  id     = $2
		  AND  status = 'pending_approval'
	`, approverID, journalID)
	if err != nil {
		return fmt.Errorf("finance: approve: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("finance: journal not found or not pending approval")
	}

	// Notify the journal submitter that it was approved.
	var submitterID uuid.UUID
	var ref string
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(submitted_by, created_by), reference FROM finance.journal_header WHERE id=$1`,
		journalID,
	).Scan(&submitterID, &ref)
	if submitterID != uuid.Nil {
		_ = notification.SendToUserByID(ctx, s.pool, submitterID, notification.InApp{
			Type:       "finance_journal_approved",
			Title:      "Journal Approved",
			Body:       fmt.Sprintf("Journal %s has been approved and posted to the ledger.", ref),
			Link:       "/finance/journals",
			Priority:   "medium",
			EntityType: "journal",
			EntityID:   &journalID,
		})
	}
	return nil
}

// RejectJournal returns a pending_approval journal to draft with a note.
func (s *Service) RejectJournal(ctx context.Context, journalID, rejectorID uuid.UUID, note string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status         = 'draft',
		       rejected_by    = $1,
		       rejected_at    = now(),
		       rejection_note = $2,
		       updated_at     = now()
		WHERE  id     = $3
		  AND  status = 'pending_approval'
	`, rejectorID, note, journalID)
	if err != nil {
		return fmt.Errorf("finance: reject: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("finance: journal not found or not pending approval")
	}

	// Notify the journal submitter that it was rejected.
	var submitterID uuid.UUID
	var ref string
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(submitted_by, created_by), reference FROM finance.journal_header WHERE id=$1`,
		journalID,
	).Scan(&submitterID, &ref)
	if submitterID != uuid.Nil {
		body := fmt.Sprintf("Journal %s has been rejected.", ref)
		if note != "" {
			body = fmt.Sprintf("Journal %s has been rejected: %s", ref, note)
		}
		_ = notification.SendToUserByID(ctx, s.pool, submitterID, notification.InApp{
			Type:       "finance_journal_rejected",
			Title:      "Journal Rejected",
			Body:       body,
			Link:       "/finance/journals",
			Priority:   "urgent",
			EntityType: "journal",
			EntityID:   &journalID,
		})
	}
	return nil
}

// subStr converts a *uuid.UUID to a string for use in SQL text comparisons.
// Passing nil *uuid.UUID as a non-first pgx parameter can fail OID inference;
// using text avoids the issue. SQL pattern: ($N = '' OR col::text = $N).
func subStr(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

// ═════════════════════════════════════════════════════════════════════════════
// Financial Reports — P&L and Balance Sheet
// ═════════════════════════════════════════════════════════════════════════════

type ReportLine struct {
	Code   string  `json:"code"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type ReportGroup struct {
	Group string       `json:"group"`
	Lines []ReportLine `json:"lines"`
	Total float64      `json:"total"`
}

type PLReport struct {
	From           string        `json:"from"`
	To             string        `json:"to"`
	Revenue        []ReportGroup `json:"revenue"`
	Expenses       []ReportGroup `json:"expenses"`
	TotalRevenue   float64       `json:"total_revenue"`
	TotalExpenses  float64       `json:"total_expenses"`
	NetIncome      float64       `json:"net_income"`
}

type BalanceSheetReport struct {
	AsOf        string        `json:"as_of"`
	Assets      []ReportGroup `json:"assets"`
	Liabilities []ReportGroup `json:"liabilities"`
	Equity      []ReportGroup `json:"equity"`
	TotalAssets float64       `json:"total_assets"`
	TotalLiab   float64       `json:"total_liabilities"`
	TotalEquity float64       `json:"total_equity"`
	IsBalanced  bool          `json:"is_balanced"`
}

func (s *Service) GetProfitAndLoss(ctx context.Context, fromDate, toDate string, subsidiaryID *uuid.UUID) (PLReport, error) {
	const q = `
		SELECT a.account_group, a.code, a.name,
		       COALESCE(SUM(
		           CASE WHEN a.account_type = 'REVENUE' THEN l.credit - l.debit
		                ELSE l.debit - l.credit END
		       ), 0)::float8 AS amount
		FROM   finance.account a
		LEFT   JOIN finance.journal_line   l ON l.account_code = a.code
		LEFT   JOIN finance.journal_header h ON h.id = l.journal_id
		           AND h.status = 'posted'
		           AND ($1::text = '' OR h.date::text >= $1)
		           AND ($2::text = '' OR h.date::text <= $2)
		           AND ($3 = '' OR h.subsidiary_id::text = $3)
		WHERE  a.account_type IN ('REVENUE','EXPENSE')
		  AND  a.is_active = true
		  AND  NOT a.is_header
		GROUP  BY a.account_type, a.account_group, a.code, a.name
		ORDER  BY a.account_type, a.account_group, a.code
	`
	rows, err := s.pool.Query(ctx, q, fromDate, toDate, subStr(subsidiaryID))
	if err != nil {
		return PLReport{}, err
	}
	defer rows.Close()

	revGroups := map[string]*ReportGroup{}
	expGroups := map[string]*ReportGroup{}
	var revOrder, expOrder []string

	for rows.Next() {
		var grp, code, name string
		var amount float64
		// We need account_type to distinguish revenue from expense
		if err := rows.Scan(&grp, &code, &name, &amount); err != nil {
			return PLReport{}, err
		}
		// Determine type from code prefix (4xxx = revenue, 5xxx = expense)
		if len(code) > 0 && code[0] == '4' {
			if _, ok := revGroups[grp]; !ok {
				revGroups[grp] = &ReportGroup{Group: grp}
				revOrder = append(revOrder, grp)
			}
			revGroups[grp].Lines = append(revGroups[grp].Lines, ReportLine{Code: code, Name: name, Amount: amount})
			revGroups[grp].Total += amount
		} else {
			if _, ok := expGroups[grp]; !ok {
				expGroups[grp] = &ReportGroup{Group: grp}
				expOrder = append(expOrder, grp)
			}
			expGroups[grp].Lines = append(expGroups[grp].Lines, ReportLine{Code: code, Name: name, Amount: amount})
			expGroups[grp].Total += amount
		}
	}
	if err := rows.Err(); err != nil {
		return PLReport{}, err
	}

	var totalRev, totalExp float64
	revSlice := make([]ReportGroup, 0, len(revOrder))
	for _, g := range revOrder {
		revSlice = append(revSlice, *revGroups[g])
		totalRev += revGroups[g].Total
	}
	expSlice := make([]ReportGroup, 0, len(expOrder))
	for _, g := range expOrder {
		expSlice = append(expSlice, *expGroups[g])
		totalExp += expGroups[g].Total
	}

	return PLReport{
		From: fromDate, To: toDate,
		Revenue: revSlice, Expenses: expSlice,
		TotalRevenue: totalRev, TotalExpenses: totalExp,
		NetIncome: totalRev - totalExp,
	}, nil
}

func (s *Service) GetBalanceSheet(ctx context.Context, asOf string, subsidiaryID *uuid.UUID) (BalanceSheetReport, error) {
	const q = `
		SELECT a.account_type, a.account_group, a.code, a.name,
		       COALESCE(SUM(
		           CASE WHEN a.normal_balance = 'DR' THEN l.debit - l.credit
		                ELSE l.credit - l.debit END
		       ), 0)::float8 AS balance
		FROM   finance.account a
		LEFT   JOIN finance.journal_line   l ON l.account_code = a.code
		LEFT   JOIN finance.journal_header h ON h.id = l.journal_id
		           AND h.status = 'posted'
		           AND ($1::text = '' OR h.date::text <= $1)
		           AND ($2 = '' OR h.subsidiary_id::text = $2)
		WHERE  a.account_type IN ('ASSET','LIABILITY','EQUITY')
		  AND  a.is_active = true
		  AND  NOT a.is_header
		GROUP  BY a.account_type, a.account_group, a.code, a.name, a.normal_balance
		ORDER  BY a.account_type, a.account_group, a.code
	`
	rows, err := s.pool.Query(ctx, q, asOf, subStr(subsidiaryID))
	if err != nil {
		return BalanceSheetReport{}, err
	}
	defer rows.Close()

	assetGroups := map[string]*ReportGroup{}
	liabGroups  := map[string]*ReportGroup{}
	equityGroups := map[string]*ReportGroup{}
	var assetOrder, liabOrder, equityOrder []string

	for rows.Next() {
		var accType, grp, code, name string
		var balance float64
		if err := rows.Scan(&accType, &grp, &code, &name, &balance); err != nil {
			return BalanceSheetReport{}, err
		}
		line := ReportLine{Code: code, Name: name, Amount: balance}
		switch accType {
		case "ASSET":
			if _, ok := assetGroups[grp]; !ok {
				assetGroups[grp] = &ReportGroup{Group: grp}
				assetOrder = append(assetOrder, grp)
			}
			assetGroups[grp].Lines = append(assetGroups[grp].Lines, line)
			assetGroups[grp].Total += balance
		case "LIABILITY":
			if _, ok := liabGroups[grp]; !ok {
				liabGroups[grp] = &ReportGroup{Group: grp}
				liabOrder = append(liabOrder, grp)
			}
			liabGroups[grp].Lines = append(liabGroups[grp].Lines, line)
			liabGroups[grp].Total += balance
		case "EQUITY":
			if _, ok := equityGroups[grp]; !ok {
				equityGroups[grp] = &ReportGroup{Group: grp}
				equityOrder = append(equityOrder, grp)
			}
			equityGroups[grp].Lines = append(equityGroups[grp].Lines, line)
			equityGroups[grp].Total += balance
		}
	}
	if err := rows.Err(); err != nil {
		return BalanceSheetReport{}, err
	}

	toSlice := func(m map[string]*ReportGroup, order []string) ([]ReportGroup, float64) {
		var total float64
		sl := make([]ReportGroup, 0, len(order))
		for _, g := range order {
			sl = append(sl, *m[g])
			total += m[g].Total
		}
		return sl, total
	}

	assets, totalAssets   := toSlice(assetGroups, assetOrder)
	liabs,  totalLiab     := toSlice(liabGroups,  liabOrder)
	equity, totalEquity   := toSlice(equityGroups, equityOrder)

	return BalanceSheetReport{
		AsOf: asOf,
		Assets: assets, Liabilities: liabs, Equity: equity,
		TotalAssets: totalAssets, TotalLiab: totalLiab, TotalEquity: totalEquity,
		IsBalanced: math.Abs(totalAssets-(totalLiab+totalEquity)) < 0.01,
	}, nil
}

// ═════════════════════════════════════════════════════════════════════════════
// Chart of Accounts
// ═════════════════════════════════════════════════════════════════════════════

type Account struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	AccountType   string  `json:"account_type"`
	AccountGroup  string  `json:"account_group"`
	ParentCode    *string `json:"parent_code,omitempty"`
	NormalBalance string  `json:"normal_balance"`
	IsHeader      bool    `json:"is_header"`
	IsActive      bool    `json:"is_active"`
	Description   string  `json:"description"`
}

type AccountInput struct {
	Name          string  `json:"name"`
	AccountType   string  `json:"account_type"`
	AccountGroup  string  `json:"account_group"`
	ParentCode    *string `json:"parent_code"`
	NormalBalance string  `json:"normal_balance"`
	IsHeader      bool    `json:"is_header"`
	Description   string  `json:"description"`
}

func (s *Service) ListAccounts(ctx context.Context, q string, activeOnly bool) ([]Account, error) {
	query := `
		SELECT code, name, account_type, account_group,
		       parent_code, normal_balance, is_header, is_active, description
		FROM   finance.account
		WHERE  ($1::text = '' OR code ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
		  AND  (NOT $2 OR is_active = true)
		ORDER  BY code
	`
	rows, err := s.pool.Query(ctx, query, q, activeOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAccounts(rows)
}

func (s *Service) CreateAccount(ctx context.Context, code string, in AccountInput) (Account, error) {
	if code == "" || in.Name == "" || in.AccountType == "" {
		return Account{}, fmt.Errorf("finance: code, name and account_type are required")
	}
	nb := in.NormalBalance
	if nb == "" {
		switch in.AccountType {
		case "ASSET", "EXPENSE":
			nb = "DR"
		default:
			nb = "CR"
		}
	}
	var a Account
	err := s.pool.QueryRow(ctx, `
		INSERT INTO finance.account
		    (code, name, account_type, account_group, parent_code, normal_balance, is_header, description)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING code, name, account_type, account_group, parent_code,
		          normal_balance, is_header, is_active, description
	`, code, in.Name, in.AccountType, in.AccountGroup, in.ParentCode, nb, in.IsHeader, in.Description,
	).Scan(&a.Code, &a.Name, &a.AccountType, &a.AccountGroup, &a.ParentCode,
		&a.NormalBalance, &a.IsHeader, &a.IsActive, &a.Description)
	return a, err
}

func (s *Service) UpdateAccount(ctx context.Context, code string, in AccountInput) (Account, error) {
	var a Account
	err := s.pool.QueryRow(ctx, `
		UPDATE finance.account
		SET    name = COALESCE(NULLIF($1,''), name),
		       account_group = COALESCE(NULLIF($2,''), account_group),
		       description   = $3
		WHERE  code = $4
		RETURNING code, name, account_type, account_group, parent_code,
		          normal_balance, is_header, is_active, description
	`, in.Name, in.AccountGroup, in.Description, code,
	).Scan(&a.Code, &a.Name, &a.AccountType, &a.AccountGroup, &a.ParentCode,
		&a.NormalBalance, &a.IsHeader, &a.IsActive, &a.Description)
	if err != nil {
		return Account{}, fmt.Errorf("finance: account not found: %w", err)
	}
	return a, nil
}

func (s *Service) ToggleAccountActive(ctx context.Context, code string) (Account, error) {
	var a Account
	err := s.pool.QueryRow(ctx, `
		UPDATE finance.account SET is_active = NOT is_active WHERE code = $1
		RETURNING code, name, account_type, account_group, parent_code,
		          normal_balance, is_header, is_active, description
	`, code).Scan(&a.Code, &a.Name, &a.AccountType, &a.AccountGroup, &a.ParentCode,
		&a.NormalBalance, &a.IsHeader, &a.IsActive, &a.Description)
	return a, err
}

func scanAccounts(rows pgx.Rows) ([]Account, error) {
	var out []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.Code, &a.Name, &a.AccountType, &a.AccountGroup,
			&a.ParentCode, &a.NormalBalance, &a.IsHeader, &a.IsActive, &a.Description); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ═════════════════════════════════════════════════════════════════════════════
// Accounting Periods
// ═════════════════════════════════════════════════════════════════════════════

type Period struct {
	ID           uuid.UUID  `json:"id"`
	SubsidiaryID *uuid.UUID `json:"subsidiary_id,omitempty"`
	Year         int        `json:"year"`
	Month        int        `json:"month"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	OpenedAt     time.Time  `json:"opened_at"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`
}

func (s *Service) ListPeriods(ctx context.Context, year int) ([]Period, error) {
	const q = `
		SELECT id, subsidiary_id, year, month, name, status, opened_at, closed_at
		FROM   finance.period
		WHERE  ($1 = 0 OR year = $1)
		ORDER  BY year DESC, month DESC
	`
	rows, err := s.pool.Query(ctx, q, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Period
	for rows.Next() {
		var p Period
		if err := rows.Scan(&p.ID, &p.SubsidiaryID, &p.Year, &p.Month,
			&p.Name, &p.Status, &p.OpenedAt, &p.ClosedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Service) CreatePeriod(ctx context.Context, year, month int, name string) (Period, error) {
	if name == "" {
		months := [...]string{"", "January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"}
		if month >= 1 && month <= 12 {
			name = fmt.Sprintf("%s %d", months[month], year)
		}
	}
	var p Period
	err := s.pool.QueryRow(ctx, `
		INSERT INTO finance.period (subsidiary_id, year, month, name, status)
		VALUES (NULL, $1, $2, $3, 'open')
		ON CONFLICT (subsidiary_id, year, month) DO NOTHING
		RETURNING id, subsidiary_id, year, month, name, status, opened_at, closed_at
	`, year, month, name).Scan(&p.ID, &p.SubsidiaryID, &p.Year, &p.Month,
		&p.Name, &p.Status, &p.OpenedAt, &p.ClosedAt)
	if err != nil {
		return Period{}, fmt.Errorf("finance: create period: %w", err)
	}
	return p, nil
}

func (s *Service) SetPeriodStatus(ctx context.Context, id uuid.UUID, status string, byID uuid.UUID) (Period, error) {
	if status != "open" && status != "closed" && status != "locked" {
		return Period{}, fmt.Errorf("finance: invalid period status %q", status)
	}
	closedAt := "NULL"
	_ = closedAt
	var p Period
	err := s.pool.QueryRow(ctx, `
		UPDATE finance.period
		SET    status    = $1,
		       closed_at = CASE WHEN $1 IN ('closed','locked') THEN now() ELSE NULL END,
		       closed_by = CASE WHEN $1 IN ('closed','locked') THEN $2  ELSE NULL END
		WHERE  id = $3
		  AND  status != 'locked'
		RETURNING id, subsidiary_id, year, month, name, status, opened_at, closed_at
	`, status, byID, id).Scan(&p.ID, &p.SubsidiaryID, &p.Year, &p.Month,
		&p.Name, &p.Status, &p.OpenedAt, &p.ClosedAt)
	if err != nil {
		return Period{}, fmt.Errorf("finance: period not found or locked: %w", err)
	}
	return p, nil
}

// periodStatusForDate returns the status of the period covering date d, or ""
// if no period record exists (caller treats missing period as open).
func (s *Service) periodStatusForDate(ctx context.Context, d time.Time) string {
	var status string
	_ = s.pool.QueryRow(ctx, `
		SELECT status FROM finance.period
		WHERE  (subsidiary_id IS NULL)
		  AND  year  = $1 AND month = $2
		LIMIT 1
	`, d.Year(), int(d.Month())).Scan(&status)
	return status
}

// ═════════════════════════════════════════════════════════════════════════════
// Trial Balance
// ═════════════════════════════════════════════════════════════════════════════

type TrialBalanceRow struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	AccountType   string  `json:"account_type"`
	AccountGroup  string  `json:"account_group"`
	NormalBalance string  `json:"normal_balance"`
	IsHeader      bool    `json:"is_header"`
	TotalDebit    float64 `json:"total_debit"`
	TotalCredit   float64 `json:"total_credit"`
	NetBalance    float64 `json:"net_balance"` // DR − CR; negative = credit balance
}

func (s *Service) GetTrialBalance(ctx context.Context, subsidiaryID *uuid.UUID, asOf string) ([]TrialBalanceRow, error) {
	const q = `
		SELECT
			a.code, a.name, a.account_type, a.account_group,
			a.normal_balance, a.is_header,
			COALESCE(SUM(l.debit),  0)::float8 AS total_debit,
			COALESCE(SUM(l.credit), 0)::float8 AS total_credit,
			(COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0))::float8 AS net_balance
		FROM   finance.account a
		LEFT   JOIN finance.journal_line   l ON l.account_code  = a.code
		LEFT   JOIN finance.journal_header h ON h.id            = l.journal_id
		           AND h.status = 'posted'
		           AND ($1::text = '' OR h.date::text <= $1)
		           AND ($2 = '' OR h.subsidiary_id::text = $2)
		WHERE  a.is_active = true
		GROUP  BY a.code, a.name, a.account_type, a.account_group,
		          a.normal_balance, a.is_header
		ORDER  BY a.code
	`
	rows, err := s.pool.Query(ctx, q, asOf, subStr(subsidiaryID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrialBalanceRow
	for rows.Next() {
		var r TrialBalanceRow
		if err := rows.Scan(&r.Code, &r.Name, &r.AccountType, &r.AccountGroup,
			&r.NormalBalance, &r.IsHeader, &r.TotalDebit, &r.TotalCredit, &r.NetBalance); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ═════════════════════════════════════════════════════════════════════════════
// Account Ledger (per-account transaction history with running balance)
// ═════════════════════════════════════════════════════════════════════════════

type LedgerEntry struct {
	Date          string  `json:"date"`
	Reference     string  `json:"reference"`
	JournalDesc   string  `json:"journal_description"`
	Narration     string  `json:"narration"`
	Type          string  `json:"type"`
	Debit         float64 `json:"debit"`
	Credit        float64 `json:"credit"`
	RunningBalance float64 `json:"running_balance"`
	Status        string  `json:"status"`
	CreatedByName string  `json:"created_by_name"`
}

func (s *Service) GetAccountLedger(ctx context.Context, accountCode, fromDate, toDate string) ([]LedgerEntry, float64, error) {
	// Opening balance: all posted entries before fromDate.
	var openingDR, openingCR float64
	if fromDate != "" {
		_ = s.pool.QueryRow(ctx, `
			SELECT COALESCE(SUM(l.debit),0)::float8, COALESCE(SUM(l.credit),0)::float8
			FROM   finance.journal_line   l
			JOIN   finance.journal_header h ON h.id = l.journal_id
			WHERE  l.account_code = $1 AND h.status = 'posted' AND h.date::text < $2
		`, accountCode, fromDate).Scan(&openingDR, &openingCR)
	}
	openingBalance := openingDR - openingCR

	const q = `
		SELECT
			h.date::text, h.reference, h.description, l.narration, h.type,
			l.debit::float8, l.credit::float8, h.status, h.created_by_name
		FROM   finance.journal_line   l
		JOIN   finance.journal_header h ON h.id = l.journal_id
		WHERE  l.account_code = $1
		  AND  h.status = 'posted'
		  AND  ($2::text = '' OR h.date::text >= $2)
		  AND  ($3::text = '' OR h.date::text <= $3)
		ORDER  BY h.date, h.created_at, l.line_number
	`
	rows, err := s.pool.Query(ctx, q, accountCode, fromDate, toDate)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	running := openingBalance
	var out []LedgerEntry
	for rows.Next() {
		var e LedgerEntry
		if err := rows.Scan(&e.Date, &e.Reference, &e.JournalDesc, &e.Narration,
			&e.Type, &e.Debit, &e.Credit, &e.Status, &e.CreatedByName); err != nil {
			return nil, 0, err
		}
		running += e.Debit - e.Credit
		e.RunningBalance = running
		out = append(out, e)
	}
	return out, openingBalance, rows.Err()
}
