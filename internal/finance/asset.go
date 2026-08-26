package finance

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)


// ── Asset categories → account code mapping ───────────────────────────────────

var assetCategoryDefaults = map[string][3]string{
	// [asset_account, accum_dep_account, dep_expense_account]
	"Computer Equipment":     {"1301", "1310", "5600"},
	"Furniture and Fittings": {"1302", "1311", "5601"},
	"Office Equipment":       {"1303", "1312", "5602"},
	"Motor Vehicles":         {"1304", "1313", "5603"},
	"Software Licences":      {"1320", "1321", "5604"},
}

var defaultUsefulLifeMonths = map[string]int{
	"Computer Equipment":     36,
	"Furniture and Fittings": 60,
	"Office Equipment":       60,
	"Motor Vehicles":         60,
	"Software Licences":      36,
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Asset struct {
	ID                uuid.UUID  `json:"id"`
	Reference         string     `json:"reference"`
	SubsidiaryID      *uuid.UUID `json:"subsidiary_id,omitempty"`
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	Category          string     `json:"category"`
	AssetAccountCode  string     `json:"asset_account_code"`
	AccumDepCode      string     `json:"accum_dep_code"`
	DepExpenseCode    string     `json:"dep_expense_code"`
	AcquisitionDate   string     `json:"acquisition_date"`
	AcquisitionCost   float64    `json:"acquisition_cost"`
	SalvageValue      float64    `json:"salvage_value"`
	UsefulLifeMonths  int        `json:"useful_life_months"`
	DepMethod         string     `json:"dep_method"`
	AnnualDepRate     float64    `json:"annual_dep_rate"`
	Status            string     `json:"status"`
	BookValue         float64    `json:"book_value"`
	AccumDepreciation float64    `json:"accum_depreciation"`
	LastDepPeriod     *string    `json:"last_dep_period,omitempty"`
	JournalID         *uuid.UUID `json:"journal_id,omitempty"`
	CreatedByName     string     `json:"created_by_name"`
	CreatedAt         time.Time  `json:"created_at"`
}

type AssetDepRun struct {
	ID             uuid.UUID  `json:"id"`
	AssetID        uuid.UUID  `json:"asset_id"`
	Period         string     `json:"period"`
	DepAmount      float64    `json:"dep_amount"`
	BookValueAfter float64    `json:"book_value_after"`
	JournalID      *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type AssetWithHistory struct {
	Asset
	DepRuns []AssetDepRun `json:"dep_runs"`
}

type CreateAssetInput struct {
	SubsidiaryID     *uuid.UUID `json:"subsidiary_id"`
	Name             string     `json:"name"`
	Description      string     `json:"description"`
	Category         string     `json:"category"`
	AcquisitionDate  string     `json:"acquisition_date"`
	AcquisitionCost  float64    `json:"acquisition_cost"`
	SalvageValue     float64    `json:"salvage_value"`
	UsefulLifeMonths int        `json:"useful_life_months"`
	DepMethod        string     `json:"dep_method"`
	AnnualDepRate    float64    `json:"annual_dep_rate"`
	// Optional overrides for account codes
	AssetAccountCode string `json:"asset_account_code"`
	AccumDepCode     string `json:"accum_dep_code"`
	DepExpenseCode   string `json:"dep_expense_code"`
	// Payment method for acquisition journal
	PaidFromAccount string `json:"paid_from_account"` // defaults to 2101 (AP) or 1110 (bank)
}

// ── List / Get ────────────────────────────────────────────────────────────────

func (s *Service) ListAssets(ctx context.Context, subsidiaryID *uuid.UUID, status string) ([]Asset, error) {
	const q = `
		SELECT id, reference, subsidiary_id, name, description, category,
		       asset_account_code, accum_dep_code, dep_expense_code,
		       acquisition_date::text, acquisition_cost::float8,
		       salvage_value::float8, useful_life_months,
		       dep_method, annual_dep_rate::float8,
		       status, book_value::float8, accum_depreciation::float8,
		       last_dep_period, journal_id, created_by_name, created_at
		FROM   finance.asset
		WHERE  ($1::uuid IS NULL OR subsidiary_id = $1)
		  AND  ($2::text = ''    OR status        = $2)
		ORDER  BY acquisition_date DESC, created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAssets(rows)
}

func (s *Service) GetAsset(ctx context.Context, id uuid.UUID) (AssetWithHistory, error) {
	asset, err := s.singleAsset(ctx, id)
	if err != nil {
		return AssetWithHistory{}, err
	}
	const dq = `
		SELECT id, asset_id, period, dep_amount::float8, book_value_after::float8, journal_id, created_at
		FROM   finance.asset_dep_run WHERE asset_id = $1 ORDER BY period DESC
	`
	rows, err := s.pool.Query(ctx, dq, id)
	if err != nil {
		return AssetWithHistory{}, err
	}
	defer rows.Close()
	var runs []AssetDepRun
	for rows.Next() {
		var r AssetDepRun
		if err := rows.Scan(&r.ID, &r.AssetID, &r.Period, &r.DepAmount, &r.BookValueAfter, &r.JournalID, &r.CreatedAt); err != nil {
			return AssetWithHistory{}, err
		}
		runs = append(runs, r)
	}
	return AssetWithHistory{Asset: asset, DepRuns: runs}, rows.Err()
}

// ── Create (records acquisition journal) ─────────────────────────────────────

func (s *Service) CreateAsset(ctx context.Context, byID uuid.UUID, byName string, in CreateAssetInput) (Asset, error) {
	if in.Name == "" || in.Category == "" || in.AcquisitionCost <= 0 {
		return Asset{}, fmt.Errorf("finance: name, category and acquisition_cost are required")
	}

	// Default account codes from category
	codes := assetCategoryDefaults[in.Category]
	if in.AssetAccountCode == "" && codes[0] != "" {
		in.AssetAccountCode = codes[0]
	}
	if in.AccumDepCode == "" && codes[1] != "" {
		in.AccumDepCode = codes[1]
	}
	if in.DepExpenseCode == "" && codes[2] != "" {
		in.DepExpenseCode = codes[2]
	}
	if in.UsefulLifeMonths == 0 {
		if ul, ok := defaultUsefulLifeMonths[in.Category]; ok {
			in.UsefulLifeMonths = ul
		} else {
			in.UsefulLifeMonths = 60
		}
	}
	if in.DepMethod == "" {
		in.DepMethod = "straight_line"
	}
	if in.PaidFromAccount == "" {
		in.PaidFromAccount = "1110" // default: GTBank
	}

	// Get account names for the journal
	assetAccName, paidAccName := "Fixed Asset", "Cash at Bank"
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.AssetAccountCode).Scan(&assetAccName)
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.PaidFromAccount).Scan(&paidAccName)

	// Parse acquisition date before opening the transaction.
	acqDate, err := time.Parse("2006-01-02", in.AcquisitionDate)
	if err != nil {
		return Asset{}, fmt.Errorf("finance: invalid acquisition_date")
	}

	// Single transaction covers: reference counter, journal header+lines, asset row.
	// Atomicity: if the asset INSERT fails, the journal is also rolled back.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Asset{}, err
	}
	defer tx.Rollback(ctx)

	// Generate asset reference (e.g. ASSET/2026/0001).
	ref, err := s.nextDocRef(ctx, tx, "ASSET")
	if err != nil {
		return Asset{}, fmt.Errorf("finance: generate asset ref: %w", err)
	}

	// Generate journal reference.
	var jSeq int
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_ref_counter (year, last_seq) VALUES ($1, 1)
		ON CONFLICT (year) DO UPDATE SET last_seq = finance.journal_ref_counter.last_seq + 1
		RETURNING last_seq
	`, acqDate.Year()).Scan(&jSeq); err != nil {
		return Asset{}, fmt.Errorf("finance: generate journal ref: %w", err)
	}
	jRef := fmt.Sprintf("JV/%d/%03d", acqDate.Year(), jSeq)
	jDesc := fmt.Sprintf("Asset acquisition: %s – %s", ref, in.Name)

	// Insert journal header.
	var journalID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.journal_header
		    (subsidiary_id, reference, date, type, description,
		     debit_total, credit_total, line_count, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,2,$8,$9)
		RETURNING id
	`, in.SubsidiaryID, jRef, acqDate, "Capital Expenditure", jDesc,
		in.AcquisitionCost, in.AcquisitionCost, byID, byName,
	).Scan(&journalID); err != nil {
		return Asset{}, fmt.Errorf("finance: create journal header: %w", err)
	}

	// Insert journal lines.
	for i, line := range []struct{ code, name, narr string; dr, cr float64 }{
		{in.AssetAccountCode, assetAccName, in.Name, in.AcquisitionCost, 0},
		{in.PaidFromAccount, paidAccName, "Payment for " + in.Name, 0, in.AcquisitionCost},
	} {
		if _, err := tx.Exec(ctx, `
			INSERT INTO finance.journal_line
			    (journal_id, line_number, account_code, account_name, narration, debit, credit)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
		`, journalID, i+1, line.code, line.name, line.narr, line.dr, line.cr); err != nil {
			return Asset{}, fmt.Errorf("finance: insert journal line %d: %w", i+1, err)
		}
	}

	// Post the journal (mark as posted) within the same transaction.
	if _, err := tx.Exec(ctx, `
		UPDATE finance.journal_header
		SET    status = 'posted', posted_by = $1, posted_at = now(), updated_at = now()
		WHERE  id = $2
	`, byID, journalID); err != nil {
		return Asset{}, fmt.Errorf("finance: post journal: %w", err)
	}

	// Insert asset record
	var assetID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO finance.asset
		    (reference, subsidiary_id, name, description, category,
		     asset_account_code, accum_dep_code, dep_expense_code,
		     acquisition_date, acquisition_cost, salvage_value,
		     useful_life_months, dep_method, annual_dep_rate,
		     book_value, journal_id, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		RETURNING id
	`, ref, in.SubsidiaryID, in.Name, in.Description, in.Category,
		in.AssetAccountCode, in.AccumDepCode, in.DepExpenseCode,
		acqDate, in.AcquisitionCost, in.SalvageValue,
		in.UsefulLifeMonths, in.DepMethod, in.AnnualDepRate,
		in.AcquisitionCost, journalID, byID, byName,
	).Scan(&assetID); err != nil {
		return Asset{}, fmt.Errorf("finance: insert asset: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Asset{}, err
	}
	return s.singleAsset(ctx, assetID)
}

// ── Run Depreciation ──────────────────────────────────────────────────────────

// DepreciateAsset runs one period of depreciation for a single asset.
func (s *Service) DepreciateAsset(ctx context.Context, assetID uuid.UUID, period string, byID uuid.UUID, byName string) (AssetDepRun, error) {
	asset, err := s.singleAsset(ctx, assetID)
	if err != nil {
		return AssetDepRun{}, err
	}
	if asset.Status != "active" {
		return AssetDepRun{}, fmt.Errorf("finance: asset is %s", asset.Status)
	}
	if asset.LastDepPeriod != nil && *asset.LastDepPeriod >= period {
		return AssetDepRun{}, fmt.Errorf("finance: period %s already depreciated (last: %s)", period, *asset.LastDepPeriod)
	}

	// Compute depreciation amount
	var depAmount float64
	if asset.DepMethod == "reducing_balance" {
		depAmount = math.Round(asset.BookValue*(asset.AnnualDepRate/100)/12*100) / 100
	} else {
		depAmount = math.Round((asset.AcquisitionCost-asset.SalvageValue)/float64(asset.UsefulLifeMonths)*100) / 100
	}

	newBookValue := math.Round((asset.BookValue-depAmount)*100) / 100
	if newBookValue < asset.SalvageValue {
		depAmount = math.Round((asset.BookValue-asset.SalvageValue)*100) / 100
		newBookValue = asset.SalvageValue
	}
	if depAmount <= 0 {
		return AssetDepRun{}, fmt.Errorf("finance: asset is fully depreciated")
	}

	// Get account names
	depExpName, accumDepName := "Depreciation Expense", "Accumulated Depreciation"
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, asset.DepExpenseCode).Scan(&depExpName)
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, asset.AccumDepCode).Scan(&accumDepName)

	// Parse period to get a date (last day of the month)
	periodDate := period + "-01"
	t, _ := time.Parse("2006-01-02", periodDate)
	lastDay := time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC)

	journal, err := s.CreateJournal(ctx, byID, byName, CreateJournalInput{
		SubsidiaryID: asset.SubsidiaryID,
		Date:         lastDay.Format("2006-01-02"),
		Type:         "Depreciation",
		Description:  fmt.Sprintf("Depreciation: %s – %s (%s)", asset.Reference, asset.Name, period),
		Lines: []JournalLineInput{
			{AccountCode: asset.DepExpenseCode, AccountName: depExpName,
				Narration: asset.Name + " depreciation – " + period, Debit: depAmount},
			{AccountCode: asset.AccumDepCode, AccountName: accumDepName,
				Narration: asset.Name + " accumulated depreciation", Credit: depAmount},
		},
	})
	if err != nil {
		return AssetDepRun{}, fmt.Errorf("finance: create dep journal: %w", err)
	}
	if err := s.PostJournal(ctx, journal.ID, byID); err != nil {
		return AssetDepRun{}, fmt.Errorf("finance: post dep journal: %w", err)
	}

	// Record the run
	var runID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO finance.asset_dep_run (asset_id, period, dep_amount, book_value_after, journal_id)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, assetID, period, depAmount, newBookValue, journal.ID).Scan(&runID); err != nil {
		return AssetDepRun{}, err
	}

	// Update asset book value and status
	newStatus := "active"
	if newBookValue <= asset.SalvageValue+0.01 {
		newStatus = "fully_depreciated"
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE finance.asset
		SET    book_value         = $1,
		       accum_depreciation = accum_depreciation + $2,
		       last_dep_period    = $3,
		       status             = $4
		WHERE  id = $5
	`, newBookValue, depAmount, period, newStatus, assetID); err != nil {
		return AssetDepRun{}, err
	}

	return AssetDepRun{
		ID: runID, AssetID: assetID, Period: period,
		DepAmount: depAmount, BookValueAfter: newBookValue,
		JournalID: &journal.ID, CreatedAt: time.Now(),
	}, nil
}

// DepreciateAll runs depreciation for all active assets for a given period.
func (s *Service) DepreciateAll(ctx context.Context, subsidiaryID *uuid.UUID, period string, byID uuid.UUID, byName string) ([]AssetDepRun, error) {
	assets, err := s.ListAssets(ctx, subsidiaryID, "active")
	if err != nil {
		return nil, err
	}
	var runs []AssetDepRun
	for _, a := range assets {
		run, err := s.DepreciateAsset(ctx, a.ID, period, byID, byName)
		if err != nil {
			continue // skip already-depreciated or zero-dep assets
		}
		runs = append(runs, run)
	}
	return runs, nil
}

// ── Dispose Asset ─────────────────────────────────────────────────────────────

func (s *Service) DisposeAsset(ctx context.Context, assetID, byID uuid.UUID, byName, disposalDate string, proceeds float64, notes string, bankCode string) error {
	asset, err := s.singleAsset(ctx, assetID)
	if err != nil {
		return err
	}
	if asset.Status == "disposed" {
		return fmt.Errorf("finance: asset already disposed")
	}

	gainLoss := proceeds - asset.BookValue
	bankName := "Cash at Bank"
	assetName, accumName := asset.Name, "Accumulated Depreciation"
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, bankCode).Scan(&bankName)
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, asset.AccumDepCode).Scan(&accumName)
	// 4090 = Other Income (gain on disposal of fixed assets — not FX-related).
	// 5803 = Realised Losses on Investments (closest available loss account).
	gainLossCode, gainLossName := "4090", "Other Income"
	if gainLoss < 0 {
		gainLossCode, gainLossName = "5803", "Realised Losses on Investments"
	}
	gainLossAbs := math.Abs(gainLoss)

	lines := []JournalLineInput{
		// Remove accumulated depreciation
		{AccountCode: asset.AccumDepCode, AccountName: accumName,
			Narration: "Disposal: " + assetName, Debit: asset.AccumDepreciation},
		// Remove asset at cost
		{AccountCode: asset.AssetAccountCode, AccountName: assetName,
			Narration: "Disposal: " + assetName, Credit: asset.AcquisitionCost},
	}
	if proceeds > 0 {
		lines = append(lines, JournalLineInput{
			AccountCode: bankCode, AccountName: bankName,
			Narration: "Disposal proceeds: " + assetName, Debit: proceeds,
		})
	}
	if gainLoss > 0 {
		lines = append(lines, JournalLineInput{
			AccountCode: gainLossCode, AccountName: gainLossName,
			Narration: "Gain on disposal: " + assetName, Credit: gainLossAbs,
		})
	} else if gainLoss < 0 {
		lines = append(lines, JournalLineInput{
			AccountCode: gainLossCode, AccountName: gainLossName,
			Narration: "Loss on disposal: " + assetName, Debit: gainLossAbs,
		})
	}

	journal, err := s.CreateJournal(ctx, byID, byName, CreateJournalInput{
		SubsidiaryID: asset.SubsidiaryID,
		Date:         disposalDate,
		Type:         "Asset Disposal",
		Description:  fmt.Sprintf("Disposal of %s – %s", asset.Reference, assetName),
		Lines:        lines,
	})
	if err != nil {
		return fmt.Errorf("finance: create disposal journal: %w", err)
	}
	if err := s.PostJournal(ctx, journal.ID, byID); err != nil {
		return fmt.Errorf("finance: post disposal journal: %w", err)
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO finance.asset_disposal
		    (asset_id, disposal_date, disposal_amount, gain_loss, journal_id, notes, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, assetID, disposalDate, proceeds, gainLoss, journal.ID, notes, byID)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		UPDATE finance.asset SET status = 'disposed', book_value = 0 WHERE id = $1`, assetID)
	return err
}

// ── VAT Return ────────────────────────────────────────────────────────────────

type VATReturn struct {
	From        string  `json:"from"`
	To          string  `json:"to"`
	OutputVAT   float64 `json:"output_vat"`   // VAT collected on sales (2121)
	InputVAT    float64 `json:"input_vat"`    // VAT paid on purchases (1151)
	NetVATDue   float64 `json:"net_vat_due"`  // Output - Input (if positive, pay to FIRS)
}

func (s *Service) GetVATReturn(ctx context.Context, from, to string, subsidiaryID *uuid.UUID) (VATReturn, error) {
	const q = `
		SELECT
		    COALESCE(SUM(CASE WHEN l.account_code = '2121' THEN l.credit - l.debit ELSE 0 END), 0)::float8 AS output_vat,
		    COALESCE(SUM(CASE WHEN l.account_code = '1151' THEN l.debit - l.credit ELSE 0 END), 0)::float8 AS input_vat
		FROM   finance.journal_line   l
		JOIN   finance.journal_header h ON h.id = l.journal_id
		WHERE  l.account_code IN ('2121','1151')
		  AND  h.status = 'posted'
		  AND  ($1::text = '' OR h.date::text >= $1)
		  AND  ($2::text = '' OR h.date::text <= $2)
		  AND  ($3 = '' OR h.subsidiary_id::text = $3)
	`
	var vr VATReturn
	vr.From = from
	vr.To = to
	if err := s.pool.QueryRow(ctx, q, from, to, subStr(subsidiaryID)).Scan(&vr.OutputVAT, &vr.InputVAT); err != nil {
		return VATReturn{}, err
	}
	vr.NetVATDue = math.Round((vr.OutputVAT-vr.InputVAT)*100) / 100
	return vr, nil
}

// ── WHT Register ──────────────────────────────────────────────────────────────

type WHTEntry struct {
	Date        string  `json:"date"`
	Reference   string  `json:"reference"`
	Description string  `json:"description"`
	WHTPayable  float64 `json:"wht_payable"`   // credit to 2122 (AP WHT)
	WHTCredit   float64 `json:"wht_credit"`    // debit to 1150 (AR WHT deducted by clients)
}

type WHTRegister struct {
	From         string     `json:"from"`
	To           string     `json:"to"`
	Entries      []WHTEntry `json:"entries"`
	TotalPayable float64    `json:"total_payable"`
	TotalCredit  float64    `json:"total_credit"`
	NetWHTDue    float64    `json:"net_wht_due"`
}

func (s *Service) GetWHTRegister(ctx context.Context, from, to string, subsidiaryID *uuid.UUID) (WHTRegister, error) {
	const q = `
		SELECT h.date::text, h.reference, h.description,
		       COALESCE(SUM(CASE WHEN l.account_code = '2122' THEN l.credit ELSE 0 END), 0)::float8 AS wht_payable,
		       COALESCE(SUM(CASE WHEN l.account_code = '1150' THEN l.debit  ELSE 0 END), 0)::float8 AS wht_credit
		FROM   finance.journal_line   l
		JOIN   finance.journal_header h ON h.id = l.journal_id
		WHERE  l.account_code IN ('2122','1150')
		  AND  h.status = 'posted'
		  AND  ($1::text = '' OR h.date::text >= $1)
		  AND  ($2::text = '' OR h.date::text <= $2)
		  AND  ($3 = '' OR h.subsidiary_id::text = $3)
		GROUP  BY h.date, h.reference, h.description
		HAVING SUM(CASE WHEN l.account_code = '2122' THEN l.credit ELSE 0 END) > 0
		    OR SUM(CASE WHEN l.account_code = '1150' THEN l.debit  ELSE 0 END) > 0
		ORDER  BY h.date, h.reference
	`
	rows, err := s.pool.Query(ctx, q, from, to, subStr(subsidiaryID))
	if err != nil {
		return WHTRegister{}, err
	}
	defer rows.Close()

	var reg WHTRegister
	reg.From = from
	reg.To = to

	for rows.Next() {
		var e WHTEntry
		if err := rows.Scan(&e.Date, &e.Reference, &e.Description, &e.WHTPayable, &e.WHTCredit); err != nil {
			return WHTRegister{}, err
		}
		reg.Entries = append(reg.Entries, e)
		reg.TotalPayable += e.WHTPayable
		reg.TotalCredit += e.WHTCredit
	}
	if err := rows.Err(); err != nil {
		return WHTRegister{}, err
	}
	reg.NetWHTDue = math.Round((reg.TotalPayable-reg.TotalCredit)*100) / 100
	return reg, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (s *Service) singleAsset(ctx context.Context, id uuid.UUID) (Asset, error) {
	const q = `
		SELECT id, reference, subsidiary_id, name, description, category,
		       asset_account_code, accum_dep_code, dep_expense_code,
		       acquisition_date::text, acquisition_cost::float8,
		       salvage_value::float8, useful_life_months,
		       dep_method, annual_dep_rate::float8,
		       status, book_value::float8, accum_depreciation::float8,
		       last_dep_period, journal_id, created_by_name, created_at
		FROM   finance.asset WHERE id = $1
	`
	var a Asset
	if err := s.pool.QueryRow(ctx, q, id).Scan(
		&a.ID, &a.Reference, &a.SubsidiaryID, &a.Name, &a.Description, &a.Category,
		&a.AssetAccountCode, &a.AccumDepCode, &a.DepExpenseCode,
		&a.AcquisitionDate, &a.AcquisitionCost, &a.SalvageValue, &a.UsefulLifeMonths,
		&a.DepMethod, &a.AnnualDepRate, &a.Status, &a.BookValue, &a.AccumDepreciation,
		&a.LastDepPeriod, &a.JournalID, &a.CreatedByName, &a.CreatedAt,
	); err != nil {
		return Asset{}, fmt.Errorf("finance: asset not found: %w", err)
	}
	return a, nil
}

func scanAssets(rows pgx.Rows) ([]Asset, error) {
	var out []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(
			&a.ID, &a.Reference, &a.SubsidiaryID, &a.Name, &a.Description, &a.Category,
			&a.AssetAccountCode, &a.AccumDepCode, &a.DepExpenseCode,
			&a.AcquisitionDate, &a.AcquisitionCost, &a.SalvageValue, &a.UsefulLifeMonths,
			&a.DepMethod, &a.AnnualDepRate, &a.Status, &a.BookValue, &a.AccumDepreciation,
			&a.LastDepPeriod, &a.JournalID, &a.CreatedByName, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
