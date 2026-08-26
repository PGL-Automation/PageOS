package portfolio

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/finance"
)

// ── Redemption preview (read-only — no DB writes) ─────────────────────────────

// RedemptionPreview computes all the numbers for a proposed redemption,
// including early-exit detection, penalty, WHT, and net proceeds.
// The frontend uses this to show a detailed breakdown before the user confirms.
type RedemptionPreview struct {
	// Account context
	AccountID     uuid.UUID `json:"account_id"`
	AccountNumber string    `json:"account_number"`
	ClientName    string    `json:"client_name"`
	FundName      string    `json:"fund_name"`

	// Maturity / lock-up
	InvestmentDate  string  `json:"investment_date"`
	MaturityDate    *string `json:"maturity_date,omitempty"`
	DaysHeld        int     `json:"days_held"`
	DaysToMaturity  int     `json:"days_to_maturity"`
	IsEarlyRedemption bool  `json:"is_early_redemption"`

	// Lock-up enforcement
	LockUpViolation bool    `json:"lock_up_violation"`
	LockUpEndsOn    *string `json:"lock_up_ends_on,omitempty"`

	// Early redemption notice
	NoticeRequired  bool    `json:"notice_required"`
	NoticeEndsOn    *string `json:"notice_ends_on,omitempty"`

	// Amounts
	RequestedAmount float64 `json:"requested_amount"`   // what the client asked for
	PrincipalAmount float64 `json:"principal_amount"`   // their cost basis being returned

	// Interest
	FullAccruedInterest   float64 `json:"full_accrued_interest"`   // at full agreed_rate
	ActualAccruedInterest float64 `json:"actual_accrued_interest"` // after penalty rate

	// Penalty
	PenaltyType        string  `json:"penalty_type"`
	PenaltyAmount      float64 `json:"penalty_amount"`
	PenaltyDescription string  `json:"penalty_description"`

	// Tax
	WHTRate   float64 `json:"wht_rate"`   // 10% corporate / 15% individual
	WHTAmount float64 `json:"wht_amount"` // on actual accrued interest

	// Settlement
	GrossProceeds float64 `json:"gross_proceeds"`
	NetProceeds   float64 `json:"net_proceeds"`
	NavPerUnit    float64 `json:"nav_per_unit"`
	UnitsToRedeem float64 `json:"units_to_redeem"`

	// Warnings surfaced to the user
	Warnings []string `json:"warnings,omitempty"`
}

// GetRedemptionPreview computes a RedemptionPreview without committing anything.
// Call this before ProcessRedemptionWithPenalty to show the breakdown to the user.
func (s *Service) GetRedemptionPreview(ctx context.Context, accountID uuid.UUID, requestedAmount float64, navPerUnit float64, requestDate string) (RedemptionPreview, error) {
	acc, err := s.getClientAccount(ctx, accountID)
	if err != nil {
		return RedemptionPreview{}, err
	}

	// Load fund penalty terms
	var (
		tenorDays              *int
		lockUpDays             int
		earlyRedemptionAllowed bool
		fundPenaltyType        string
		fullRate, earlyExitRate, penaltyRate *float64
		noticePeriodDays       int
	)
	if err := s.pool.QueryRow(ctx, `
		SELECT tenor_days, lock_up_days, early_redemption_allowed,
		       penalty_type, full_rate, early_exit_rate, penalty_rate,
		       notice_period_days
		FROM   portfolio.fund WHERE id = $1
	`, acc.FundID).Scan(
		&tenorDays, &lockUpDays, &earlyRedemptionAllowed,
		&fundPenaltyType, &fullRate, &earlyExitRate, &penaltyRate,
		&noticePeriodDays,
	); err != nil {
		return RedemptionPreview{}, fmt.Errorf("portfolio: load fund terms: %w", err)
	}

	// Load account-level overrides
	var (
		accTenorDays    *int
		investmentDate  *string
		maturityDate    *string
		agreedRate      *float64
		whtRate         float64
		clientType      string
	)
	if err := s.pool.QueryRow(ctx, `
		SELECT tenor_days, investment_date::text, maturity_date::text,
		       agreed_rate, COALESCE(wht_rate, 10.0)::float8, client_type
		FROM   portfolio.client_account WHERE id = $1
	`, accountID).Scan(
		&accTenorDays, &investmentDate, &maturityDate,
		&agreedRate, &whtRate, &clientType,
	); err != nil {
		return RedemptionPreview{}, fmt.Errorf("portfolio: load account terms: %w", err)
	}

	// Use account overrides if set, otherwise fund defaults
	effectiveTenor := tenorDays
	if accTenorDays != nil {
		effectiveTenor = accTenorDays
	}
	effectiveRate := fullRate
	if agreedRate != nil {
		effectiveRate = agreedRate
	}
	effectivePenaltyType := fundPenaltyType

	// Parse dates
	reqDate, err := time.Parse("2006-01-02", requestDate)
	if err != nil {
		return RedemptionPreview{}, fmt.Errorf("portfolio: invalid request_date")
	}

	preview := RedemptionPreview{
		AccountID:     acc.ID,
		AccountNumber: acc.AccountNumber,
		ClientName:    acc.ClientName,
		FundName:      acc.FundName,
		WHTRate:       whtRate,
		RequestedAmount: requestedAmount,
	}

	// Days held
	if investmentDate != nil {
		invDate, _ := time.Parse("2006-01-02", *investmentDate)
		preview.InvestmentDate = *investmentDate
		preview.DaysHeld = int(reqDate.Sub(invDate).Hours() / 24)
	} else {
		preview.InvestmentDate = requestDate
		preview.DaysHeld = 0
	}

	// Maturity
	if maturityDate != nil {
		preview.MaturityDate = maturityDate
		matDate, _ := time.Parse("2006-01-02", *maturityDate)
		daysToMat := int(matDate.Sub(reqDate).Hours() / 24)
		if daysToMat < 0 {
			daysToMat = 0
		}
		preview.DaysToMaturity = daysToMat
		preview.IsEarlyRedemption = reqDate.Before(matDate)
	}

	// Lock-up violation check
	if investmentDate != nil && lockUpDays > 0 {
		invDate, _ := time.Parse("2006-01-02", *investmentDate)
		lockUpEnd := invDate.AddDate(0, 0, lockUpDays)
		if reqDate.Before(lockUpEnd) {
			preview.LockUpViolation = true
			s := lockUpEnd.Format("2006-01-02")
			preview.LockUpEndsOn = &s
			preview.Warnings = append(preview.Warnings,
				fmt.Sprintf("This investment has a lock-up period until %s. Early redemption is not permitted.", s))
		}
	}

	// Notice period check
	if noticePeriodDays > 0 {
		minRedemptionDate := reqDate.AddDate(0, 0, noticePeriodDays)
		if minRedemptionDate.After(reqDate) {
			preview.NoticeRequired = true
			s := minRedemptionDate.Format("2006-01-02")
			preview.NoticeEndsOn = &s
			preview.Warnings = append(preview.Warnings,
				fmt.Sprintf("This fund requires %d business days notice. Earliest settlement: %s.", noticePeriodDays, s))
		}
	}

	if !earlyRedemptionAllowed && preview.IsEarlyRedemption {
		preview.LockUpViolation = true
		preview.Warnings = append(preview.Warnings,
			"Early redemption is not permitted for this fund. You must hold until maturity.")
	}

	// ── Compute proceeds ──────────────────────────────────────────────────────

	// Units to redeem
	if navPerUnit <= 0 {
		navPerUnit = 1.0
	}
	preview.NavPerUnit = navPerUnit

	if requestedAmount <= 0 {
		// Full redemption
		requestedAmount = round2(acc.UnitsHeld * navPerUnit)
		preview.RequestedAmount = requestedAmount
	}
	units := round2(requestedAmount / navPerUnit)
	if units > acc.UnitsHeld {
		units = acc.UnitsHeld
		requestedAmount = round2(units * navPerUnit)
		preview.RequestedAmount = requestedAmount
	}
	preview.UnitsToRedeem = units

	// Principal amount (cost basis of units being redeemed)
	costPerUnit := 0.0
	if acc.UnitsHeld > 0 {
		costPerUnit = acc.InvestedAmount / acc.UnitsHeld
	}
	principal := round2(units * costPerUnit)
	preview.PrincipalAmount = principal

	// Accrued interest calculation
	var fullAccrued, actualAccrued float64
	if effectiveRate != nil && preview.DaysHeld > 0 {
		fullAccrued = round2(principal * (*effectiveRate / 100) * float64(preview.DaysHeld) / 365)
		actualAccrued = fullAccrued // same unless penalty modifies it
	}
	preview.FullAccruedInterest = fullAccrued

	// ── Penalty computation ───────────────────────────────────────────────────

	var penaltyAmount float64
	preview.PenaltyType = effectivePenaltyType

	if preview.IsEarlyRedemption && !preview.LockUpViolation {
		switch effectivePenaltyType {
		case "reduced_rate":
			rate := 0.0
			if earlyExitRate != nil {
				rate = *earlyExitRate
			}
			actualAccrued = round2(principal * (rate / 100) * float64(preview.DaysHeld) / 365)
			penaltyAmount = round2(fullAccrued - actualAccrued)
			preview.PenaltyDescription = fmt.Sprintf(
				"Early exit rate %.2f%% p.a. applied (vs %.2f%% p.a. at full tenor). "+
					"Foregone interest: ₦%.2f",
				rate, safeRate(effectiveRate), penaltyAmount)

		case "flat_fee":
			rate := 0.0
			if penaltyRate != nil {
				rate = *penaltyRate
			}
			penaltyAmount = round2(principal * rate / 100)
			actualAccrued = fullAccrued
			preview.PenaltyDescription = fmt.Sprintf(
				"%.2f%% flat fee on principal (₦%.2f)", rate, penaltyAmount)

		case "interest_forfeit":
			rate := 0.0
			if penaltyRate != nil {
				rate = *penaltyRate
			}
			penaltyAmount = round2(fullAccrued * rate / 100)
			actualAccrued = round2(fullAccrued - penaltyAmount)
			preview.PenaltyDescription = fmt.Sprintf(
				"%.2f%% of accrued interest (₦%.2f) forfeited", rate, penaltyAmount)

		case "none":
			preview.PenaltyDescription = "No penalty — early redemption is allowed fee-free"
		}

		if effectiveTenor != nil && preview.DaysHeld < *effectiveTenor {
			preview.Warnings = append(preview.Warnings,
				fmt.Sprintf("Early redemption: %d of %d days held. Penalty applied: ₦%.2f",
					preview.DaysHeld, *effectiveTenor, penaltyAmount))
		}
	}

	preview.ActualAccruedInterest = actualAccrued
	preview.PenaltyAmount = penaltyAmount

	// ── WHT on actual accrued interest ────────────────────────────────────────
	whtAmount := round2(actualAccrued * whtRate / 100)
	preview.WHTAmount = whtAmount

	// ── Final proceeds ────────────────────────────────────────────────────────
	gross := round2(principal + actualAccrued - penaltyAmount)
	net := round2(gross - whtAmount)
	preview.GrossProceeds = gross
	preview.NetProceeds = net

	if preview.IsEarlyRedemption && !preview.LockUpViolation && penaltyAmount > 0 {
		preview.Warnings = append(preview.Warnings,
			fmt.Sprintf("WHT (%.0f%%) of ₦%.2f deducted from interest income.", whtRate, whtAmount))
	}

	return preview, nil
}

func safeRate(r *float64) float64 {
	if r == nil {
		return 0
	}
	return *r
}

// ── ProcessRedemptionWithPenalty — the confirmed redemption ───────────────────

type ConfirmedRedemptionInput struct {
	AccountID      uuid.UUID `json:"account_id"`
	RequestedAmount float64  `json:"requested_amount"` // 0 = full
	NavPerUnit     float64   `json:"nav_per_unit"`
	RequestDate    string    `json:"request_date"`
	BankCode       string    `json:"bank_account_code"`
	DestinationBank string   `json:"destination_bank_name"`   // client's bank name
	DestinationAcc  string   `json:"destination_account_no"`  // client's bank account number
	Narration      string    `json:"narration"`
}

// ProcessRedemptionWithPenalty runs GetRedemptionPreview, enforces lock-up,
// applies the penalty, deducts WHT, posts the GL journal, and records the
// client transaction with full penalty detail.
func (s *Service) ProcessRedemptionWithPenalty(ctx context.Context, in ConfirmedRedemptionInput, byID uuid.UUID, byName string) (ClientTransaction, RedemptionPreview, error) {
	preview, err := s.GetRedemptionPreview(ctx, in.AccountID, in.RequestedAmount, in.NavPerUnit, in.RequestDate)
	if err != nil {
		return ClientTransaction{}, preview, err
	}

	// Enforce lock-up
	if preview.LockUpViolation {
		return ClientTransaction{}, preview, fmt.Errorf("portfolio: redemption blocked — %s",
			func() string {
				if preview.LockUpEndsOn != nil {
					return "lock-up period active until " + *preview.LockUpEndsOn
				}
				return "early redemption not permitted for this fund"
			}())
	}

	acc, err := s.getClientAccount(ctx, in.AccountID)
	if err != nil {
		return ClientTransaction{}, preview, err
	}
	fund, err := s.getFund(ctx, acc.FundID)
	if err != nil {
		return ClientTransaction{}, preview, err
	}

	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	bankName := "Cash at Bank"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)
	// clientFundName variable kept for compatibility but 2110 is now used in the journal lines below.
	_ = "unused"

	narration := in.Narration
	if narration == "" {
		narration = fmt.Sprintf("Redemption – %s – %s", acc.ClientName, acc.AccountNumber)
		if preview.IsEarlyRedemption {
			narration += fmt.Sprintf(" (Early, %d days held)", preview.DaysHeld)
		}
	}

	// Build GL lines
	// Debit = full client entitlement before deductions (principal + accrued interest).
	// This is InvestedAmount + ActualAccruedInterest, which equals GrossProceeds + PenaltyAmount.
	// Using this as the single debit ensures the journal balances:
	//   Dr 2110 (full entitlement) = Cr Bank (net) + Cr Penalty(4001) + Cr WHT(2122)
	// The interest income is implicitly captured in the debit expansion rather than as a
	// separate Cr 4010 line (which would double-count and break balance).
	fullEntitlement := round2(acc.InvestedAmount + preview.ActualAccruedInterest)

	clientFundName2110 := "Client Funds Payable"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = '2110'`).Scan(&clientFundName2110)

	lines := []finance.JournalLineInput{
		// Clear full client liability (principal + accrued interest owed to client).
		{AccountCode: "2110", AccountName: clientFundName2110,
			Narration: narration, Debit: fullEntitlement},
		// Pay net proceeds to client's bank.
		{AccountCode: in.BankCode, AccountName: bankName,
			Narration: narration, Credit: preview.NetProceeds},
	}

	// Penalty income (earns revenue for the firm on early exit).
	if preview.PenaltyAmount > 0 {
		feeName := "Management Fees Income"
		feeCode := "4001"
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, feeCode).Scan(&feeName)
		lines = append(lines, finance.JournalLineInput{
			AccountCode: feeCode, AccountName: feeName,
			Narration: fmt.Sprintf("Early redemption penalty – %s", acc.AccountNumber),
			Credit:    preview.PenaltyAmount,
		})
	}

	// WHT payable on interest component.
	if preview.WHTAmount > 0 {
		whtName := "WHT Payable"
		whtCode := "2122"
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, whtCode).Scan(&whtName)
		lines = append(lines, finance.JournalLineInput{
			AccountCode: whtCode, AccountName: whtName,
			Narration: fmt.Sprintf("WHT (%.0f%%) – %s", preview.WHTRate, acc.AccountNumber),
			Credit:    preview.WHTAmount,
		})
	}

	// Balance verification (all cases):
	// Debits:  fullEntitlement = InvestedAmount + ActualAccruedInterest
	// Credits: NetProceeds + PenaltyAmount + WHTAmount
	//        = (InvestedAmount + ActualAccruedInterest - Penalty - WHT) + Penalty + WHT
	//        = InvestedAmount + ActualAccruedInterest  ✓

	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: fund.SubsidiaryID,
		Date:         in.RequestDate,
		Type:         "Redemption",
		Description:  narration,
		Lines:        lines,
	})
	if err != nil {
		return ClientTransaction{}, preview, fmt.Errorf("portfolio: create journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return ClientTransaction{}, preview, fmt.Errorf("portfolio: post journal: %w", err)
	}

	// Update account
	newUnits := round2(acc.UnitsHeld - preview.UnitsToRedeem)
	newValue := round2(newUnits * preview.NavPerUnit)
	realizedPnL := round2(preview.NetProceeds - preview.PrincipalAmount)

	if _, err := s.pool.Exec(ctx, `
		UPDATE portfolio.client_account
		SET    units_held      = $2,
		       invested_amount = GREATEST(0, invested_amount - $3),
		       current_value   = $4,
		       realized_pnl    = realized_pnl + $5,
		       unrealized_pnl  = $4 - GREATEST(0, invested_amount - $3),
		       status          = CASE WHEN $2 = 0 THEN 'closed' ELSE status END,
		       updated_at      = now()
		WHERE  id = $1
	`, in.AccountID, newUnits, preview.PrincipalAmount, newValue, realizedPnL); err != nil {
		return ClientTransaction{}, preview, err
	}

	// Update fund AUM
	_, _ = s.pool.Exec(ctx, `UPDATE portfolio.fund SET aum = GREATEST(0, aum - $2) WHERE id = $1`,
		acc.FundID, preview.NetProceeds)

	// Record the full transaction
	ref := fmt.Sprintf("RED/%s/%s", acc.AccountNumber, in.RequestDate)
	var txID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.client_transaction
		    (account_id, txn_type, txn_date, amount, units, nav_per_unit,
		     fees, net_amount, running_balance, reference, narration, status,
		     is_early_redemption, days_held,
		     full_accrued_interest, actual_accrued_interest,
		     penalty_amount, penalty_type, wht_amount,
		     journal_id, created_by, created_by_name)
		VALUES ($1,'redemption',$2,$3,$4,$5,$6,$7,$8,$9,$10,'settled',
		        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
		RETURNING id
	`, in.AccountID, in.RequestDate,
		preview.GrossProceeds, preview.UnitsToRedeem, preview.NavPerUnit,
		preview.PenaltyAmount + preview.WHTAmount, preview.NetProceeds, newValue,
		ref, narration,
		preview.IsEarlyRedemption, preview.DaysHeld,
		preview.FullAccruedInterest, preview.ActualAccruedInterest,
		preview.PenaltyAmount, preview.PenaltyType, preview.WHTAmount,
		journal.ID, byID, byName,
	).Scan(&txID); err != nil {
		return ClientTransaction{}, preview, err
	}

	txn, err := s.getClientTransaction(ctx, txID)
	return txn, preview, err
}

// daysInYear returns 365 (could be 366 for leap year accounting).
func daysInYear() float64 { return 365.0 }

func r2(v float64) float64 { return math.Round(v*100) / 100 }
