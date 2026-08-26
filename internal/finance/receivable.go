package finance

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type Receivable struct {
	ID                    uuid.UUID  `json:"id"`
	Reference             string     `json:"reference"`
	ClientID              *uuid.UUID `json:"client_id,omitempty"`
	ClientName            string     `json:"client_name"`
	ClientEmail           string     `json:"client_email"`
	SubsidiaryID          *uuid.UUID `json:"subsidiary_id,omitempty"`
	InvoiceDate           string     `json:"invoice_date"`
	DueDate               string     `json:"due_date"`
	FeeType               string     `json:"fee_type"`
	Description           string     `json:"description"`
	Status                string     `json:"status"`
	GrossAmount           float64    `json:"gross_amount"`
	WHTDeducted           float64    `json:"wht_deducted"`
	AmountReceived        float64    `json:"amount_received"`
	Outstanding           float64    `json:"outstanding"`
	ReceivableAccountCode string     `json:"receivable_account_code"`
	RevenueAccountCode    string     `json:"revenue_account_code"`
	CreatedBy             uuid.UUID  `json:"created_by"`
	CreatedByName         string     `json:"created_by_name"`
	JournalID             *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	DaysOverdue           int        `json:"days_overdue"`
}

type ReceivableReceipt struct {
	ID              uuid.UUID  `json:"id"`
	ReceivableID    uuid.UUID  `json:"receivable_id"`
	ReceiptDate     string     `json:"receipt_date"`
	Amount          float64    `json:"amount"`
	BankAccountCode string     `json:"bank_account_code"`
	BankAccountName string     `json:"bank_account_name"`
	Reference       string     `json:"reference"`
	Notes           string     `json:"notes"`
	JournalID       *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type CreateReceivableInput struct {
	ClientID              *uuid.UUID `json:"client_id"`
	ClientName            string     `json:"client_name"`
	ClientEmail           string     `json:"client_email"`
	SubsidiaryID          *uuid.UUID `json:"subsidiary_id"`
	InvoiceDate           string     `json:"invoice_date"`
	DueDate               string     `json:"due_date"`
	FeeType               string     `json:"fee_type"`
	Description           string     `json:"description"`
	GrossAmount           float64    `json:"gross_amount"`
	WHTDeducted           float64    `json:"wht_deducted"`
	ReceivableAccountCode string     `json:"receivable_account_code"`
	RevenueAccountCode    string     `json:"revenue_account_code"`
}

type RecordReceiptInput struct {
	ReceiptDate     string  `json:"receipt_date"`
	Amount          float64 `json:"amount"`
	BankAccountCode string  `json:"bank_account_code"`
	BankAccountName string  `json:"bank_account_name"`
	Reference       string  `json:"reference"`
	Notes           string  `json:"notes"`
}

// feeTypeAccounts maps fee types to (receivable_account, revenue_account) pairs.
var feeTypeAccounts = map[string][2]string{
	"management_fee":  {"1130", "4001"},
	"performance_fee": {"1131", "4002"},
	"advisory_fee":    {"1133", "4003"},
	"brokerage":       {"1132", "4004"},
	"custody_fee":     {"1134", "4007"},
}

// ── List ──────────────────────────────────────────────────────────────────────

func (s *Service) ListReceivables(ctx context.Context, status string, subsidiaryID *uuid.UUID) ([]Receivable, error) {
	const q = `
		SELECT id, reference, client_id, client_name, client_email,
		       subsidiary_id, invoice_date::text, due_date::text,
		       fee_type, description, status,
		       gross_amount::float8, wht_deducted::float8, amount_received::float8,
		       (gross_amount - amount_received)::float8 AS outstanding,
		       receivable_account_code, revenue_account_code,
		       created_by, created_by_name, journal_id, created_at,
		       GREATEST(0, (CURRENT_DATE - due_date))
		FROM   finance.receivable
		WHERE  ($1::text = ''    OR status        = $1)
		  AND  ($2::uuid IS NULL OR subsidiary_id = $2)
		ORDER  BY due_date ASC, created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, status, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanReceivables(rows)
}

// ── Create (auto-generates GL journal) ───────────────────────────────────────

func (s *Service) CreateReceivable(ctx context.Context, byID uuid.UUID, byName string, in CreateReceivableInput) (Receivable, error) {
	if in.ClientName == "" {
		return Receivable{}, fmt.Errorf("finance: client_name is required")
	}
	if in.GrossAmount <= 0 {
		return Receivable{}, fmt.Errorf("finance: gross_amount must be > 0")
	}

	// Auto-assign account codes from fee type if not provided
	if in.ReceivableAccountCode == "" || in.RevenueAccountCode == "" {
		if accs, ok := feeTypeAccounts[in.FeeType]; ok {
			if in.ReceivableAccountCode == "" {
				in.ReceivableAccountCode = accs[0]
			}
			if in.RevenueAccountCode == "" {
				in.RevenueAccountCode = accs[1]
			}
		} else {
			if in.ReceivableAccountCode == "" {
				in.ReceivableAccountCode = "1130"
			}
			if in.RevenueAccountCode == "" {
				in.RevenueAccountCode = "4001"
			}
		}
	}

	invoiceDate, err := time.Parse("2006-01-02", in.InvoiceDate)
	if err != nil {
		return Receivable{}, fmt.Errorf("finance: invalid invoice_date")
	}
	dueDate := invoiceDate.AddDate(0, 0, 30)
	if in.DueDate != "" {
		if d, parseErr := time.Parse("2006-01-02", in.DueDate); parseErr == nil {
			dueDate = d
		}
	}

	// Create the GL journal first (Dr Receivable / Cr Revenue).
	recAccName, revAccName := "Fees Receivable", "Fee Income"
	var rn, rvn string
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.ReceivableAccountCode).Scan(&rn)
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.RevenueAccountCode).Scan(&rvn)
	if rn != "" {
		recAccName = rn
	}
	if rvn != "" {
		revAccName = rvn
	}

	journal, err := s.CreateJournal(ctx, byID, byName, CreateJournalInput{
		SubsidiaryID: in.SubsidiaryID,
		Date:         in.InvoiceDate,
		Type:         "Receipt",
		Description:  fmt.Sprintf("AR Invoice: %s – %s", in.FeeType, in.ClientName),
		Lines: []JournalLineInput{
			{AccountCode: in.ReceivableAccountCode, AccountName: recAccName,
				Narration: in.ClientName + " – " + in.Description, Debit: in.GrossAmount},
			{AccountCode: in.RevenueAccountCode, AccountName: revAccName,
				Narration: in.ClientName + " – " + in.Description, Credit: in.GrossAmount},
		},
	})
	if err != nil {
		return Receivable{}, fmt.Errorf("finance: create AR journal: %w", err)
	}
	if err := s.PostJournal(ctx, journal.ID, byID); err != nil {
		return Receivable{}, fmt.Errorf("finance: post AR journal: %w", err)
	}

	// Create the receivable record.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Receivable{}, err
	}
	defer tx.Rollback(ctx)

	ref, err := s.nextDocRef(ctx, tx, "AR")
	if err != nil {
		return Receivable{}, err
	}

	var receivableID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.receivable
		    (reference, client_id, client_name, client_email, subsidiary_id,
		     invoice_date, due_date, fee_type, description, gross_amount, wht_deducted,
		     receivable_account_code, revenue_account_code,
		     status, created_by, created_by_name, journal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'outstanding',$14,$15,$16)
		RETURNING id
	`, ref, in.ClientID, in.ClientName, in.ClientEmail, in.SubsidiaryID,
		invoiceDate, dueDate, in.FeeType, in.Description, in.GrossAmount, in.WHTDeducted,
		in.ReceivableAccountCode, in.RevenueAccountCode,
		byID, byName, journal.ID,
	).Scan(&receivableID); err != nil {
		return Receivable{}, fmt.Errorf("finance: insert receivable: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Receivable{}, err
	}
	return s.singleReceivable(ctx, receivableID)
}

// ── Record Receipt ────────────────────────────────────────────────────────────

func (s *Service) RecordReceipt(ctx context.Context, receivableID, byID uuid.UUID, byName string, in RecordReceiptInput) (Receivable, error) {
	rec, err := s.singleReceivable(ctx, receivableID)
	if err != nil {
		return Receivable{}, err
	}
	if rec.Status == "paid" || rec.Status == "cancelled" {
		return Receivable{}, fmt.Errorf("finance: receivable is already %s", rec.Status)
	}
	if in.Amount <= 0 {
		return Receivable{}, fmt.Errorf("finance: amount must be > 0")
	}

	bankName := in.BankAccountName
	if bankName == "" {
		var n string
		_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.BankAccountCode).Scan(&n)
		if n != "" {
			bankName = n
		} else {
			bankName = "Cash at Bank"
		}
	}

	// GL journal: Dr Bank / Cr Receivable
	recAccName := "Fees Receivable"
	var rn string
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, rec.ReceivableAccountCode).Scan(&rn)
	if rn != "" {
		recAccName = rn
	}

	// When the client deducts WHT at source, they pay the net amount and the firm
	// is owed a WHT credit from FIRS. The AR gross should be fully cleared:
	//   Dr Bank (net received)           = in.Amount
	//   Dr 1150 WHT Credit Receivable    = rec.WHTDeducted  (WHT owed by FIRS to firm)
	//   Cr Receivable (gross invoice)    = in.Amount + rec.WHTDeducted
	var whtLines []JournalLineInput
	totalCredit := in.Amount
	if rec.WHTDeducted > 0 {
		whtAccName := "WHT Credit Receivable"
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = '1150'`).Scan(&whtAccName)
		whtLines = append(whtLines, JournalLineInput{
			AccountCode: "1150", AccountName: whtAccName,
			Narration: fmt.Sprintf("WHT deducted by %s – %s", rec.ClientName, rec.Reference),
			Debit: rec.WHTDeducted,
		})
		totalCredit = math.Round((in.Amount+rec.WHTDeducted)*100) / 100
	}

	receiptLines := []JournalLineInput{
		{AccountCode: in.BankAccountCode, AccountName: bankName,
			Narration: "Receipt from " + rec.ClientName + " – " + rec.Reference, Debit: in.Amount},
	}
	receiptLines = append(receiptLines, whtLines...)
	receiptLines = append(receiptLines, JournalLineInput{
		AccountCode: rec.ReceivableAccountCode, AccountName: recAccName,
		Narration: rec.Reference, Credit: totalCredit,
	})

	journal, err := s.CreateJournal(ctx, byID, byName, CreateJournalInput{
		SubsidiaryID: rec.SubsidiaryID,
		Date:         in.ReceiptDate,
		Type:         "Receipt",
		Description:  fmt.Sprintf("Receipt: %s from %s", rec.Reference, rec.ClientName),
		Lines:        receiptLines,
	})
	if err != nil {
		return Receivable{}, fmt.Errorf("finance: create receipt journal: %w", err)
	}
	if err := s.PostJournal(ctx, journal.ID, byID); err != nil {
		return Receivable{}, fmt.Errorf("finance: post receipt journal: %w", err)
	}

	newReceived := rec.AmountReceived + in.Amount
	newStatus := "partial"
	if newReceived >= rec.GrossAmount-0.01 {
		newStatus = "paid"
	}

	if _, err := s.pool.Exec(ctx, `
		UPDATE finance.receivable
		SET    amount_received = amount_received + $1,
		       status          = $2,
		       updated_at      = now()
		WHERE  id = $3
	`, in.Amount, newStatus, receivableID); err != nil {
		return Receivable{}, err
	}

	// Record the receipt detail
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO finance.receivable_receipt
		    (receivable_id, receipt_date, amount, bank_account_code, bank_account_name, reference, notes, journal_id, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, receivableID, in.ReceiptDate, in.Amount, in.BankAccountCode, bankName, in.Reference, in.Notes, journal.ID, byID,
	); err != nil {
		return Receivable{}, err
	}

	return s.singleReceivable(ctx, receivableID)
}

// ── AR Aging ──────────────────────────────────────────────────────────────────

func (s *Service) GetARAging(ctx context.Context, subsidiaryID *uuid.UUID) ([]AgingBucket, error) {
	const q = `
		SELECT
			CASE
				WHEN due_date >= CURRENT_DATE       THEN 'Current'
				WHEN due_date >= CURRENT_DATE - 30  THEN '1–30 days'
				WHEN due_date >= CURRENT_DATE - 60  THEN '31–60 days'
				WHEN due_date >= CURRENT_DATE - 90  THEN '61–90 days'
				ELSE                                     '90+ days'
			END                                         AS label,
			COUNT(*)::int                               AS cnt,
			SUM(gross_amount - amount_received)::float8 AS amount
		FROM   finance.receivable
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

func (s *Service) GetReceivable(ctx context.Context, id uuid.UUID) (Receivable, error) {
	return s.singleReceivable(ctx, id)
}

func (s *Service) singleReceivable(ctx context.Context, id uuid.UUID) (Receivable, error) {
	const q = `
		SELECT id, reference, client_id, client_name, client_email,
		       subsidiary_id, invoice_date::text, due_date::text,
		       fee_type, description, status,
		       gross_amount::float8, wht_deducted::float8, amount_received::float8,
		       (gross_amount - amount_received)::float8,
		       receivable_account_code, revenue_account_code,
		       created_by, created_by_name, journal_id, created_at,
		       GREATEST(0, (CURRENT_DATE - due_date))
		FROM   finance.receivable WHERE id = $1
	`
	var r Receivable
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&r.ID, &r.Reference, &r.ClientID, &r.ClientName, &r.ClientEmail,
		&r.SubsidiaryID, &r.InvoiceDate, &r.DueDate,
		&r.FeeType, &r.Description, &r.Status,
		&r.GrossAmount, &r.WHTDeducted, &r.AmountReceived, &r.Outstanding,
		&r.ReceivableAccountCode, &r.RevenueAccountCode,
		&r.CreatedBy, &r.CreatedByName, &r.JournalID, &r.CreatedAt, &r.DaysOverdue,
	)
	return r, err
}

func scanReceivables(rows pgx.Rows) ([]Receivable, error) {
	var out []Receivable
	for rows.Next() {
		var r Receivable
		if err := rows.Scan(
			&r.ID, &r.Reference, &r.ClientID, &r.ClientName, &r.ClientEmail,
			&r.SubsidiaryID, &r.InvoiceDate, &r.DueDate,
			&r.FeeType, &r.Description, &r.Status,
			&r.GrossAmount, &r.WHTDeducted, &r.AmountReceived, &r.Outstanding,
			&r.ReceivableAccountCode, &r.RevenueAccountCode,
			&r.CreatedBy, &r.CreatedByName, &r.JournalID, &r.CreatedAt, &r.DaysOverdue,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
