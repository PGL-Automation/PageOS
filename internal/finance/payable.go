package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type Payable struct {
	ID               uuid.UUID  `json:"id"`
	Reference        string     `json:"reference"`
	VendorID         uuid.UUID  `json:"vendor_id"`
	VendorName       string     `json:"vendor_name"`
	SubsidiaryID     *uuid.UUID `json:"subsidiary_id,omitempty"`
	VendorInvoiceNo  string     `json:"vendor_invoice_no"`
	InvoiceDate      string     `json:"invoice_date"`
	DueDate          string     `json:"due_date"`
	Description      string     `json:"description"`
	Status           string     `json:"status"`
	GrossAmount      float64    `json:"gross_amount"`
	WHTAmount        float64    `json:"wht_amount"`
	NetPayable       float64    `json:"net_payable"`
	AmountPaid       float64    `json:"amount_paid"`
	Outstanding      float64    `json:"outstanding"`
	BankAccountCode  string     `json:"bank_account_code"`
	CreatedBy        uuid.UUID  `json:"created_by"`
	CreatedByName    string     `json:"created_by_name"`
	ApprovedBy       *uuid.UUID `json:"approved_by,omitempty"`
	ApprovedAt       *time.Time `json:"approved_at,omitempty"`
	JournalID        *uuid.UUID `json:"journal_id,omitempty"`
	PaymentJournalID *uuid.UUID `json:"payment_journal_id,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	DaysOverdue      int        `json:"days_overdue"`
}

type PayableLine struct {
	ID          uuid.UUID `json:"id"`
	PayableID   uuid.UUID `json:"payable_id"`
	LineNumber  int       `json:"line_number"`
	Description string    `json:"description"`
	AccountCode string    `json:"account_code"`
	AccountName string    `json:"account_name"`
	Quantity    float64   `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
	Amount      float64   `json:"amount"`
}

type PayableWithLines struct {
	Payable
	Lines []PayableLine `json:"lines"`
	Vendor Vendor       `json:"vendor"`
}

type PayableLineInput struct {
	Description string  `json:"description"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
}

type CreatePayableInput struct {
	VendorID        uuid.UUID          `json:"vendor_id"`
	SubsidiaryID    *uuid.UUID         `json:"subsidiary_id"`
	VendorInvoiceNo string             `json:"vendor_invoice_no"`
	InvoiceDate     string             `json:"invoice_date"`
	DueDate         string             `json:"due_date"`
	Description     string             `json:"description"`
	BankAccountCode string             `json:"bank_account_code"`
	Lines           []PayableLineInput `json:"lines"`
}

type AgingBucket struct {
	Label   string  `json:"label"`
	Count   int     `json:"count"`
	Amount  float64 `json:"amount"`
}

// ── List & Get ────────────────────────────────────────────────────────────────

func (s *Service) ListPayables(ctx context.Context, status string, subsidiaryID *uuid.UUID) ([]Payable, error) {
	const q = `
		SELECT p.id, p.reference, p.vendor_id, v.name AS vendor_name,
		       p.subsidiary_id, p.vendor_invoice_no,
		       p.invoice_date::text, p.due_date::text,
		       p.description, p.status,
		       p.gross_amount::float8, p.wht_amount::float8,
		       p.net_payable::float8, p.amount_paid::float8,
		       (p.net_payable - p.amount_paid)::float8 AS outstanding,
		       p.bank_account_code, p.created_by, p.created_by_name,
		       p.approved_by, p.approved_at, p.journal_id, p.payment_journal_id,
		       p.created_at,
		       GREATEST(0, (CURRENT_DATE - p.due_date)) AS days_overdue
		FROM   finance.payable p
		JOIN   finance.vendor  v ON v.id = p.vendor_id
		WHERE  ($1::text = ''    OR p.status        = $1)
		  AND  ($2::uuid IS NULL OR p.subsidiary_id = $2)
		ORDER  BY p.due_date ASC, p.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, status, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPayables(rows)
}

func (s *Service) GetPayable(ctx context.Context, id uuid.UUID) (PayableWithLines, error) {
	const hq = `
		SELECT p.id, p.reference, p.vendor_id, v.name AS vendor_name,
		       p.subsidiary_id, p.vendor_invoice_no,
		       p.invoice_date::text, p.due_date::text,
		       p.description, p.status,
		       p.gross_amount::float8, p.wht_amount::float8,
		       p.net_payable::float8, p.amount_paid::float8,
		       (p.net_payable - p.amount_paid)::float8 AS outstanding,
		       p.bank_account_code, p.created_by, p.created_by_name,
		       p.approved_by, p.approved_at, p.journal_id, p.payment_journal_id,
		       p.created_at,
		       GREATEST(0, (CURRENT_DATE - p.due_date)) AS days_overdue
		FROM   finance.payable p
		JOIN   finance.vendor  v ON v.id = p.vendor_id
		WHERE  p.id = $1
	`
	payables, err := scanPayables(s.pool.QueryRow(ctx, hq, id).(pgx.Rows))
	if err != nil || len(payables) == 0 {
		// fallback: single row scan
		var p Payable
		if err := s.pool.QueryRow(ctx, hq, id).Scan(
			&p.ID, &p.Reference, &p.VendorID, &p.VendorName,
			&p.SubsidiaryID, &p.VendorInvoiceNo, &p.InvoiceDate, &p.DueDate,
			&p.Description, &p.Status, &p.GrossAmount, &p.WHTAmount,
			&p.NetPayable, &p.AmountPaid, &p.Outstanding, &p.BankAccountCode,
			&p.CreatedBy, &p.CreatedByName, &p.ApprovedBy, &p.ApprovedAt,
			&p.JournalID, &p.PaymentJournalID, &p.CreatedAt, &p.DaysOverdue,
		); err != nil {
			return PayableWithLines{}, fmt.Errorf("finance: payable not found: %w", err)
		}
		lines, _ := s.getPayableLines(ctx, id)
		vendor, _ := s.GetVendor(ctx, p.VendorID)
		return PayableWithLines{Payable: p, Lines: lines, Vendor: vendor}, nil
	}
	return PayableWithLines{}, nil
}

func (s *Service) getPayableLines(ctx context.Context, payableID uuid.UUID) ([]PayableLine, error) {
	const q = `
		SELECT id, payable_id, line_number, description, account_code, account_name,
		       quantity::float8, unit_price::float8, amount::float8
		FROM   finance.payable_line
		WHERE  payable_id = $1 ORDER BY line_number
	`
	rows, err := s.pool.Query(ctx, q, payableID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PayableLine
	for rows.Next() {
		var l PayableLine
		if err := rows.Scan(&l.ID, &l.PayableID, &l.LineNumber, &l.Description,
			&l.AccountCode, &l.AccountName, &l.Quantity, &l.UnitPrice, &l.Amount); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *Service) CreatePayable(ctx context.Context, createdByID uuid.UUID, createdByName string, in CreatePayableInput) (Payable, error) {
	if len(in.Lines) == 0 {
		return Payable{}, fmt.Errorf("finance: at least one invoice line is required")
	}

	vendor, err := s.GetVendor(ctx, in.VendorID)
	if err != nil {
		return Payable{}, fmt.Errorf("finance: vendor not found")
	}

	invoiceDate, err := time.Parse("2006-01-02", in.InvoiceDate)
	if err != nil {
		return Payable{}, fmt.Errorf("finance: invalid invoice_date")
	}
	dueDate, err := time.Parse("2006-01-02", in.DueDate)
	if err != nil {
		// Auto-calculate due date from vendor payment terms if not provided
		dueDate = invoiceDate.AddDate(0, 0, vendor.PaymentTermsDays)
		in.DueDate = dueDate.Format("2006-01-02")
	}

	var grossAmount float64
	for _, l := range in.Lines {
		grossAmount += l.Quantity * l.UnitPrice
	}

	whtAmount := 0.0
	if vendor.WHTApplicable {
		whtAmount = grossAmount * vendor.WHTRate / 100
	}
	netPayable := grossAmount - whtAmount

	bankCode := in.BankAccountCode
	if bankCode == "" {
		bankCode = "1110"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Payable{}, err
	}
	defer tx.Rollback(ctx)

	ref, err := s.nextDocRef(ctx, tx, "AP")
	if err != nil {
		return Payable{}, err
	}

	var payableID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.payable
		    (reference, vendor_id, subsidiary_id, vendor_invoice_no,
		     invoice_date, due_date, description, gross_amount, wht_amount,
		     net_payable, bank_account_code, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id
	`, ref, in.VendorID, in.SubsidiaryID, in.VendorInvoiceNo,
		invoiceDate, dueDate, in.Description, grossAmount, whtAmount,
		netPayable, bankCode, createdByID, createdByName,
	).Scan(&payableID); err != nil {
		return Payable{}, fmt.Errorf("finance: insert payable: %w", err)
	}

	for i, l := range in.Lines {
		amt := l.Quantity * l.UnitPrice
		if _, err := tx.Exec(ctx, `
			INSERT INTO finance.payable_line
			    (payable_id, line_number, description, account_code, account_name, quantity, unit_price, amount)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, payableID, i+1, l.Description, l.AccountCode, l.AccountName, l.Quantity, l.UnitPrice, amt); err != nil {
			return Payable{}, fmt.Errorf("finance: insert line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Payable{}, err
	}

	return s.singlePayable(ctx, payableID)
}

// ── Approve (creates GL journal) ──────────────────────────────────────────────

func (s *Service) ApprovePayable(ctx context.Context, payableID, approverID uuid.UUID, approverName string) (Payable, error) {
	// Load payable + lines
	pwl, err := s.GetPayable(ctx, payableID)
	if err != nil {
		return Payable{}, err
	}
	if pwl.Status != "pending" {
		return Payable{}, fmt.Errorf("finance: invoice is not in pending state")
	}

	// Build journal lines: Dr each expense account / Cr AP / Cr WHT Payable
	jlines := make([]JournalLineInput, 0)
	for _, l := range pwl.Lines {
		jlines = append(jlines, JournalLineInput{
			AccountCode: l.AccountCode,
			AccountName: l.AccountName,
			Narration:   l.Description,
			Debit:       l.Amount,
		})
	}
	jlines = append(jlines, JournalLineInput{
		AccountCode: "2101",
		AccountName: "Accounts Payable",
		Narration:   fmt.Sprintf("%s – %s", pwl.Reference, pwl.VendorName),
		Credit:      pwl.NetPayable,
	})
	if pwl.WHTAmount > 0 {
		jlines = append(jlines, JournalLineInput{
			AccountCode: "2122",
			AccountName: "WHT Payable",
			Narration:   "WHT on " + pwl.Reference,
			Credit:      pwl.WHTAmount,
		})
	}

	journal, err := s.CreateJournal(ctx, approverID, approverName, CreateJournalInput{
		SubsidiaryID: pwl.SubsidiaryID,
		Date:         time.Now().Format("2006-01-02"),
		Type:         "Payment",
		Description:  fmt.Sprintf("AP: %s from %s", pwl.Reference, pwl.VendorName),
		Lines:        jlines,
	})
	if err != nil {
		return Payable{}, fmt.Errorf("finance: create AP journal: %w", err)
	}

	// Post the journal immediately
	if err := s.PostJournal(ctx, journal.ID, approverID); err != nil {
		return Payable{}, fmt.Errorf("finance: post AP journal: %w", err)
	}

	// Update payable
	if _, err := s.pool.Exec(ctx, `
		UPDATE finance.payable
		SET    status      = 'approved',
		       approved_by = $1,
		       approved_at = now(),
		       journal_id  = $2,
		       updated_at  = now()
		WHERE  id = $3
	`, approverID, journal.ID, payableID); err != nil {
		return Payable{}, err
	}

	return s.singlePayable(ctx, payableID)
}

// ── Record Payment ────────────────────────────────────────────────────────────

func (s *Service) PayPayable(ctx context.Context, payableID, byID uuid.UUID, byName, paymentDate, bankAccountCode string) (Payable, error) {
	p, err := s.singlePayable(ctx, payableID)
	if err != nil {
		return Payable{}, err
	}
	if p.Status != "approved" {
		return Payable{}, fmt.Errorf("finance: invoice must be approved before payment")
	}

	// Get bank account name from CoA
	bankName := "Cash at Bank"
	var aName string
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, bankAccountCode).Scan(&aName)
	if aName != "" {
		bankName = aName
	}

	outstanding := p.NetPayable - p.AmountPaid
	journal, err := s.CreateJournal(ctx, byID, byName, CreateJournalInput{
		SubsidiaryID: p.SubsidiaryID,
		Date:         paymentDate,
		Type:         "Payment",
		Description:  fmt.Sprintf("Payment: %s to %s", p.Reference, p.VendorName),
		Lines: []JournalLineInput{
			{AccountCode: "2101", AccountName: "Accounts Payable", Narration: p.Reference, Debit: outstanding},
			{AccountCode: bankAccountCode, AccountName: bankName, Narration: "Payment to " + p.VendorName, Credit: outstanding},
		},
	})
	if err != nil {
		return Payable{}, fmt.Errorf("finance: create payment journal: %w", err)
	}
	if err := s.PostJournal(ctx, journal.ID, byID); err != nil {
		return Payable{}, fmt.Errorf("finance: post payment journal: %w", err)
	}

	if _, err := s.pool.Exec(ctx, `
		UPDATE finance.payable
		SET    status             = 'paid',
		       amount_paid        = net_payable,
		       payment_journal_id = $1,
		       updated_at         = now()
		WHERE  id = $2
	`, journal.ID, payableID); err != nil {
		return Payable{}, err
	}
	return s.singlePayable(ctx, payableID)
}

// ── AP Aging ─────────────────────────────────────────────────────────────────

func (s *Service) GetAPAging(ctx context.Context, subsidiaryID *uuid.UUID) ([]AgingBucket, error) {
	const q = `
		SELECT
			CASE
				WHEN due_date >= CURRENT_DATE           THEN 'Current'
				WHEN due_date >= CURRENT_DATE - 30      THEN '1–30 days'
				WHEN due_date >= CURRENT_DATE - 60      THEN '31–60 days'
				WHEN due_date >= CURRENT_DATE - 90      THEN '61–90 days'
				ELSE                                         '90+ days'
			END                                        AS label,
			COUNT(*)::int                              AS cnt,
			SUM(net_payable - amount_paid)::float8     AS amount
		FROM   finance.payable
		WHERE  status NOT IN ('paid','cancelled')
		  AND  ($1::uuid IS NULL OR subsidiary_id = $1)
		GROUP  BY label
		ORDER  BY MIN(due_date)
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AgingBucket
	for rows.Next() {
		var b AgingBucket
		if err := rows.Scan(&b.Label, &b.Count, &b.Amount); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (s *Service) singlePayable(ctx context.Context, id uuid.UUID) (Payable, error) {
	const q = `
		SELECT p.id, p.reference, p.vendor_id, v.name,
		       p.subsidiary_id, p.vendor_invoice_no,
		       p.invoice_date::text, p.due_date::text,
		       p.description, p.status,
		       p.gross_amount::float8, p.wht_amount::float8,
		       p.net_payable::float8, p.amount_paid::float8,
		       (p.net_payable - p.amount_paid)::float8,
		       p.bank_account_code, p.created_by, p.created_by_name,
		       p.approved_by, p.approved_at, p.journal_id, p.payment_journal_id,
		       p.created_at,
		       GREATEST(0, (CURRENT_DATE - p.due_date))
		FROM   finance.payable p
		JOIN   finance.vendor  v ON v.id = p.vendor_id
		WHERE  p.id = $1
	`
	var p Payable
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&p.ID, &p.Reference, &p.VendorID, &p.VendorName,
		&p.SubsidiaryID, &p.VendorInvoiceNo, &p.InvoiceDate, &p.DueDate,
		&p.Description, &p.Status, &p.GrossAmount, &p.WHTAmount,
		&p.NetPayable, &p.AmountPaid, &p.Outstanding, &p.BankAccountCode,
		&p.CreatedBy, &p.CreatedByName, &p.ApprovedBy, &p.ApprovedAt,
		&p.JournalID, &p.PaymentJournalID, &p.CreatedAt, &p.DaysOverdue,
	)
	return p, err
}

func scanPayables(rows pgx.Rows) ([]Payable, error) {
	var out []Payable
	for rows.Next() {
		var p Payable
		if err := rows.Scan(
			&p.ID, &p.Reference, &p.VendorID, &p.VendorName,
			&p.SubsidiaryID, &p.VendorInvoiceNo, &p.InvoiceDate, &p.DueDate,
			&p.Description, &p.Status, &p.GrossAmount, &p.WHTAmount,
			&p.NetPayable, &p.AmountPaid, &p.Outstanding, &p.BankAccountCode,
			&p.CreatedBy, &p.CreatedByName, &p.ApprovedBy, &p.ApprovedAt,
			&p.JournalID, &p.PaymentJournalID, &p.CreatedAt, &p.DaysOverdue,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
