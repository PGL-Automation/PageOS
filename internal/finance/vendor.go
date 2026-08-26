package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ── Vendor ────────────────────────────────────────────────────────────────────

type Vendor struct {
	ID                uuid.UUID  `json:"id"`
	Code              string     `json:"code"`
	Name              string     `json:"name"`
	ShortName         string     `json:"short_name"`
	TaxID             string     `json:"tax_id"`
	Address           string     `json:"address"`
	ContactName       string     `json:"contact_name"`
	ContactEmail      string     `json:"contact_email"`
	ContactPhone      string     `json:"contact_phone"`
	BankName          string     `json:"bank_name"`
	BankAccountName   string     `json:"bank_account_name"`
	BankAccountNo     string     `json:"bank_account_no"`
	PaymentTermsDays  int        `json:"payment_terms_days"`
	DefaultExpenseCode string    `json:"default_expense_code"`
	WHTApplicable     bool       `json:"wht_applicable"`
	WHTRate           float64    `json:"wht_rate"`
	IsActive          bool       `json:"is_active"`
	SubsidiaryID      *uuid.UUID `json:"subsidiary_id,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

type VendorInput struct {
	Name              string     `json:"name"`
	ShortName         string     `json:"short_name"`
	TaxID             string     `json:"tax_id"`
	Address           string     `json:"address"`
	ContactName       string     `json:"contact_name"`
	ContactEmail      string     `json:"contact_email"`
	ContactPhone      string     `json:"contact_phone"`
	BankName          string     `json:"bank_name"`
	BankAccountName   string     `json:"bank_account_name"`
	BankAccountNo     string     `json:"bank_account_no"`
	PaymentTermsDays  int        `json:"payment_terms_days"`
	DefaultExpenseCode string    `json:"default_expense_code"`
	WHTApplicable     bool       `json:"wht_applicable"`
	WHTRate           float64    `json:"wht_rate"`
	SubsidiaryID      *uuid.UUID `json:"subsidiary_id"`
}

func (s *Service) nextDocRef(ctx context.Context, tx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}, docType string) (string, error) {
	year := time.Now().Year()
	var seq int
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.document_counter (year, doc_type, last_seq) VALUES ($1, $2, 1)
		ON CONFLICT (year, doc_type) DO UPDATE
		  SET last_seq = finance.document_counter.last_seq + 1
		RETURNING last_seq
	`, year, docType).Scan(&seq); err != nil {
		return "", err
	}
	switch docType {
	case "VENDOR":
		return fmt.Sprintf("VEN%d%04d", year, seq), nil
	case "AP":
		return fmt.Sprintf("AP/%d/%03d", year, seq), nil
	case "AR":
		return fmt.Sprintf("REC/%d/%03d", year, seq), nil
	}
	return fmt.Sprintf("%s/%d/%04d", docType, year, seq), nil
}

func (s *Service) ListVendors(ctx context.Context, q string, activeOnly bool) ([]Vendor, error) {
	const query = `
		SELECT id, code, name, short_name, tax_id, address,
		       contact_name, contact_email, contact_phone,
		       bank_name, bank_account_name, bank_account_no,
		       payment_terms_days, default_expense_code,
		       wht_applicable, wht_rate::float8, is_active,
		       subsidiary_id, created_at
		FROM   finance.vendor
		WHERE  ($1::text = '' OR name ILIKE '%'||$1||'%' OR code ILIKE '%'||$1||'%')
		  AND  (NOT $2 OR is_active = true)
		ORDER  BY name
	`
	rows, err := s.pool.Query(ctx, query, q, activeOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanVendors(rows)
}

func (s *Service) GetVendor(ctx context.Context, id uuid.UUID) (Vendor, error) {
	const query = `
		SELECT id, code, name, short_name, tax_id, address,
		       contact_name, contact_email, contact_phone,
		       bank_name, bank_account_name, bank_account_no,
		       payment_terms_days, default_expense_code,
		       wht_applicable, wht_rate::float8, is_active,
		       subsidiary_id, created_at
		FROM   finance.vendor WHERE id = $1
	`
	return scanVendorRow(s.pool.QueryRow(ctx, query, id))
}

func (s *Service) CreateVendor(ctx context.Context, in VendorInput) (Vendor, error) {
	if in.Name == "" {
		return Vendor{}, fmt.Errorf("finance: vendor name is required")
	}
	if in.PaymentTermsDays == 0 {
		in.PaymentTermsDays = 30
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Vendor{}, err
	}
	defer tx.Rollback(ctx)

	code, err := s.nextDocRef(ctx, tx, "VENDOR")
	if err != nil {
		return Vendor{}, fmt.Errorf("finance: generate vendor code: %w", err)
	}

	var id uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.vendor
		    (code, name, short_name, tax_id, address,
		     contact_name, contact_email, contact_phone,
		     bank_name, bank_account_name, bank_account_no,
		     payment_terms_days, default_expense_code,
		     wht_applicable, wht_rate, subsidiary_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING id
	`, code, in.Name, in.ShortName, in.TaxID, in.Address,
		in.ContactName, in.ContactEmail, in.ContactPhone,
		in.BankName, in.BankAccountName, in.BankAccountNo,
		in.PaymentTermsDays, in.DefaultExpenseCode,
		in.WHTApplicable, in.WHTRate, in.SubsidiaryID,
	).Scan(&id); err != nil {
		return Vendor{}, fmt.Errorf("finance: create vendor: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Vendor{}, err
	}
	return s.GetVendor(ctx, id)
}

func (s *Service) UpdateVendor(ctx context.Context, id uuid.UUID, in VendorInput) (Vendor, error) {
	_, err := s.pool.Exec(ctx, `
		UPDATE finance.vendor
		SET    name               = COALESCE(NULLIF($1,''), name),
		       short_name         = $2, tax_id = $3, address = $4,
		       contact_name       = $5, contact_email = $6, contact_phone = $7,
		       bank_name          = $8, bank_account_name = $9, bank_account_no = $10,
		       payment_terms_days = $11, default_expense_code = $12,
		       wht_applicable     = $13, wht_rate = $14
		WHERE  id = $15
	`, in.Name, in.ShortName, in.TaxID, in.Address,
		in.ContactName, in.ContactEmail, in.ContactPhone,
		in.BankName, in.BankAccountName, in.BankAccountNo,
		in.PaymentTermsDays, in.DefaultExpenseCode,
		in.WHTApplicable, in.WHTRate, id)
	if err != nil {
		return Vendor{}, err
	}
	return s.GetVendor(ctx, id)
}

func scanVendors(rows pgx.Rows) ([]Vendor, error) {
	var out []Vendor
	for rows.Next() {
		v, err := scanVendorRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func scanVendorRow(row interface {
	Scan(...any) error
}) (Vendor, error) {
	var v Vendor
	err := row.Scan(
		&v.ID, &v.Code, &v.Name, &v.ShortName, &v.TaxID, &v.Address,
		&v.ContactName, &v.ContactEmail, &v.ContactPhone,
		&v.BankName, &v.BankAccountName, &v.BankAccountNo,
		&v.PaymentTermsDays, &v.DefaultExpenseCode,
		&v.WHTApplicable, &v.WHTRate, &v.IsActive,
		&v.SubsidiaryID, &v.CreatedAt,
	)
	return v, err
}
