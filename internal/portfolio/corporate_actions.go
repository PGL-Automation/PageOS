package portfolio

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/finance"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type CorporateActionType string

const (
	CorporateActionCashDividend  CorporateActionType = "cash_dividend"
	CorporateActionStockDividend CorporateActionType = "stock_dividend"
	CorporateActionStockSplit    CorporateActionType = "stock_split"
	CorporateActionBonusShare    CorporateActionType = "bonus_share"
	CorporateActionRightsIssue   CorporateActionType = "rights_issue"
	CorporateActionCouponPayment CorporateActionType = "coupon_payment"
	CorporateActionMaturity      CorporateActionType = "maturity"
)

type CorporateAction struct {
	ID             uuid.UUID           `json:"id"`
	InstrumentID   uuid.UUID           `json:"instrument_id"`
	InstrumentName string              `json:"instrument_name"`
	Ticker         string              `json:"ticker"`
	ActionType     CorporateActionType `json:"action_type"`
	ExDate         time.Time           `json:"ex_date"`
	RecordDate     *time.Time          `json:"record_date,omitempty"`
	PayDate        *time.Time          `json:"pay_date,omitempty"`
	AmountPerUnit  float64             `json:"amount_per_unit"`
	Currency       string              `json:"currency"`
	SplitRatio     float64             `json:"split_ratio"`
	BonusRatio     float64             `json:"bonus_ratio"`
	RightsRatio    float64             `json:"rights_ratio"`
	RightsPrice    float64             `json:"rights_price"`
	Status         string              `json:"status"`
	Notes          string              `json:"notes"`
	ProcessedAt    *time.Time          `json:"processed_at,omitempty"`
	ProcessedBy    *uuid.UUID          `json:"processed_by,omitempty"`
	CreatedBy      uuid.UUID           `json:"created_by"`
	CreatedByName  string              `json:"created_by_name"`
	CreatedAt      time.Time           `json:"created_at"`
}

type CreateCorporateActionInput struct {
	InstrumentID  uuid.UUID           `json:"instrument_id"`
	ActionType    CorporateActionType `json:"action_type"`
	ExDate        time.Time           `json:"ex_date"`
	RecordDate    *time.Time          `json:"record_date"`
	PayDate       *time.Time          `json:"pay_date"`
	AmountPerUnit float64             `json:"amount_per_unit"`
	Currency      string              `json:"currency"`
	SplitRatio    float64             `json:"split_ratio"`
	BonusRatio    float64             `json:"bonus_ratio"`
	RightsRatio   float64             `json:"rights_ratio"`
	RightsPrice   float64             `json:"rights_price"`
	Notes         string              `json:"notes"`
}

type CorporateActionImpact struct {
	ID                    uuid.UUID  `json:"id"`
	CorporateActionID     uuid.UUID  `json:"corporate_action_id"`
	FundID                uuid.UUID  `json:"fund_id"`
	FundName              string     `json:"fund_name"`
	InstrumentID          uuid.UUID  `json:"instrument_id"`
	HoldingQuantityBefore float64    `json:"holding_quantity_before"`
	HoldingQuantityAfter  float64    `json:"holding_quantity_after"`
	CashDistributed       float64    `json:"cash_distributed"`
	WHTDeducted           float64    `json:"wht_deducted"`
	NetCash               float64    `json:"net_cash"`
	JournalID             *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
}

// ── Create ────────────────────────────────────────────────────────────────────

// CreateCorporateAction registers a new corporate action for an instrument.
// The action starts with status 'pending' and must be explicitly processed.
func (s *Service) CreateCorporateAction(ctx context.Context, in CreateCorporateActionInput, byID uuid.UUID, byName string) (CorporateAction, error) {
	if in.InstrumentID == uuid.Nil {
		return CorporateAction{}, fmt.Errorf("portfolio: instrument_id is required")
	}
	if in.ActionType == "" {
		return CorporateAction{}, fmt.Errorf("portfolio: action_type is required")
	}
	if in.ExDate.IsZero() {
		return CorporateAction{}, fmt.Errorf("portfolio: ex_date is required")
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}

	// Validate type-specific required fields.
	switch in.ActionType {
	case CorporateActionCashDividend, CorporateActionCouponPayment, CorporateActionStockDividend:
		if in.AmountPerUnit <= 0 {
			return CorporateAction{}, fmt.Errorf("portfolio: amount_per_unit must be positive for %s", in.ActionType)
		}
	case CorporateActionStockSplit:
		if in.SplitRatio <= 0 {
			return CorporateAction{}, fmt.Errorf("portfolio: split_ratio must be positive for stock_split")
		}
	case CorporateActionBonusShare:
		if in.BonusRatio <= 0 {
			return CorporateAction{}, fmt.Errorf("portfolio: bonus_ratio must be positive for bonus_share")
		}
	case CorporateActionRightsIssue:
		if in.RightsRatio <= 0 || in.RightsPrice <= 0 {
			return CorporateAction{}, fmt.Errorf("portfolio: rights_ratio and rights_price must be positive for rights_issue")
		}
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.corporate_action
		    (instrument_id, action_type, ex_date, record_date, pay_date,
		     amount_per_unit, currency, split_ratio, bonus_ratio,
		     rights_ratio, rights_price, notes, status,
		     created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14)
		RETURNING id
	`,
		in.InstrumentID, string(in.ActionType), in.ExDate, in.RecordDate, in.PayDate,
		in.AmountPerUnit, in.Currency, in.SplitRatio, in.BonusRatio,
		in.RightsRatio, in.RightsPrice, in.Notes,
		byID, byName,
	).Scan(&id); err != nil {
		return CorporateAction{}, fmt.Errorf("portfolio: create corporate action: %w", err)
	}

	return s.GetCorporateAction(ctx, id)
}

// ── List ──────────────────────────────────────────────────────────────────────

// ListCorporateActions returns corporate actions, optionally filtered by instrument and/or status.
func (s *Service) ListCorporateActions(ctx context.Context, instrumentID *uuid.UUID, status string) ([]CorporateAction, error) {
	const q = `
		SELECT ca.id, ca.instrument_id, i.name, i.ticker,
		       ca.action_type, ca.ex_date, ca.record_date, ca.pay_date,
		       ca.amount_per_unit::float8, ca.currency,
		       ca.split_ratio::float8, ca.bonus_ratio::float8,
		       ca.rights_ratio::float8, ca.rights_price::float8,
		       ca.status, ca.notes,
		       ca.processed_at, ca.processed_by,
		       ca.created_by, ca.created_by_name, ca.created_at
		FROM   portfolio.corporate_action ca
		JOIN   portfolio.instrument i ON i.id = ca.instrument_id
		WHERE  ($1::uuid IS NULL OR ca.instrument_id = $1)
		  AND  ($2 = ''           OR ca.status        = $2)
		ORDER  BY ca.ex_date DESC, ca.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, instrumentID, status)
	if err != nil {
		return nil, fmt.Errorf("portfolio: list corporate actions: %w", err)
	}
	defer rows.Close()
	return scanCorporateActions(rows)
}

// ── Get ───────────────────────────────────────────────────────────────────────

// GetCorporateAction returns a single corporate action by ID.
func (s *Service) GetCorporateAction(ctx context.Context, id uuid.UUID) (CorporateAction, error) {
	const q = `
		SELECT ca.id, ca.instrument_id, i.name, i.ticker,
		       ca.action_type, ca.ex_date, ca.record_date, ca.pay_date,
		       ca.amount_per_unit::float8, ca.currency,
		       ca.split_ratio::float8, ca.bonus_ratio::float8,
		       ca.rights_ratio::float8, ca.rights_price::float8,
		       ca.status, ca.notes,
		       ca.processed_at, ca.processed_by,
		       ca.created_by, ca.created_by_name, ca.created_at
		FROM   portfolio.corporate_action ca
		JOIN   portfolio.instrument i ON i.id = ca.instrument_id
		WHERE  ca.id = $1
	`
	row := s.pool.QueryRow(ctx, q, id)
	var ca CorporateAction
	if err := scanCorporateAction(row, &ca); err != nil {
		return CorporateAction{}, fmt.Errorf("portfolio: corporate action not found: %w", err)
	}
	return ca, nil
}

// ── Process ───────────────────────────────────────────────────────────────────

// ProcessCorporateAction applies a pending corporate action to all fund holdings.
// The entire operation runs inside a single DB transaction so it is atomic.
//
// Cash dividend / coupon:
//   Dr Bank (instrument.gl_account_code) / Cr Income (instrument.income_gl_code)
//   Dr Income (instrument.income_gl_code) / Cr WHT Payable (2201)   [10% WHT]
//
// Stock split:  adjust quantity and avg_cost, insert adjusted price record.
// Bonus share:  increase quantity at zero extra cost basis.
// Rights issue: book a buy transaction at rights_price for the entitled quantity.
func (s *Service) ProcessCorporateAction(ctx context.Context, id uuid.UUID, byID uuid.UUID, byName string) ([]CorporateActionImpact, error) {
	// 1. Load action and verify it is still pending.
	action, err := s.GetCorporateAction(ctx, id)
	if err != nil {
		return nil, err
	}
	if action.Status != "pending" {
		return nil, fmt.Errorf("portfolio: corporate action is already %s", action.Status)
	}

	// Load instrument for GL codes.
	inst, err := s.getInstrument(ctx, action.InstrumentID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: load instrument: %w", err)
	}

	// 2. Mark as processing inside a pgx transaction.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("portfolio: begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE portfolio.corporate_action
		SET    status = 'processing', updated_at = now()
		WHERE  id = $1
	`, id); err != nil {
		return nil, fmt.Errorf("portfolio: mark processing: %w", err)
	}

	// 3. Find all holdings of this instrument across all funds.
	type holdingRow struct {
		holdingID    uuid.UUID
		fundID       uuid.UUID
		fundName     string
		quantity     float64
		avgCost      float64
		bookValue    float64
		subsidiaryID *uuid.UUID
	}

	holdRows, err := tx.Query(ctx, `
		SELECT h.id, h.fund_id, f.name, h.quantity::float8, h.avg_cost::float8,
		       h.book_value::float8, f.subsidiary_id
		FROM   portfolio.holding h
		JOIN   portfolio.fund    f ON f.id = h.fund_id
		WHERE  h.instrument_id = $1 AND h.quantity > 0
		FOR UPDATE OF h
	`, action.InstrumentID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: query holdings: %w", err)
	}

	var holdings []holdingRow
	for holdRows.Next() {
		var hr holdingRow
		if err := holdRows.Scan(
			&hr.holdingID, &hr.fundID, &hr.fundName,
			&hr.quantity, &hr.avgCost, &hr.bookValue, &hr.subsidiaryID,
		); err != nil {
			holdRows.Close()
			return nil, fmt.Errorf("portfolio: scan holding: %w", err)
		}
		holdings = append(holdings, hr)
	}
	holdRows.Close()
	if err := holdRows.Err(); err != nil {
		return nil, fmt.Errorf("portfolio: iterate holdings: %w", err)
	}

	exDateStr := action.ExDate.Format("2006-01-02")

	// Pre-fetch GL account names (best-effort; fall back to code string).
	glName := func(code string) string {
		var name string
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,$1) FROM finance.account WHERE code = $1`, code).Scan(&name)
		return name
	}
	bankName := glName(inst.GLAccountCode)
	incomeName := glName(inst.IncomeGLCode)
	whtName := "WHT Payable"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'WHT Payable') FROM finance.account WHERE code = '2201'`).Scan(&whtName)

	// 4. Process each holding.
	var impacts []CorporateActionImpact

	for _, hr := range holdings {
		var impact CorporateActionImpact
		impact.CorporateActionID = id
		impact.FundID = hr.fundID
		impact.FundName = hr.fundName
		impact.InstrumentID = action.InstrumentID
		impact.HoldingQuantityBefore = hr.quantity

		switch action.ActionType {
		// ── Cash dividend / coupon payment ─────────────────────────────────────
		case CorporateActionCashDividend, CorporateActionCouponPayment:
			grossCash := round2(hr.quantity * action.AmountPerUnit)
			wht := round2(grossCash * 0.10)
			netCash := round2(grossCash - wht)

			impact.HoldingQuantityAfter = hr.quantity
			impact.CashDistributed = grossCash
			impact.WHTDeducted = wht
			impact.NetCash = netCash

			txnType := "dividend"
			if action.ActionType == CorporateActionCouponPayment {
				txnType = "coupon"
			}
			narration := fmt.Sprintf("%s – %s × ₦%.4f – %s", txnType, inst.Ticker, action.AmountPerUnit, exDateStr)

			// GL journal:
			//   Dr  Bank / Investment account (gross cash received)
			//   Cr  Income account           (gross)
			//   Dr  Income account           (WHT portion)
			//   Cr  WHT Payable 2201         (WHT)
			// Net effect: Bank +netCash, WHT Payable +wht, Income +grossCash–wht = +netCash
			jType := "Dividend Income"
			if action.ActionType == CorporateActionCouponPayment {
				jType = "Coupon Income"
			}

			journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
				SubsidiaryID: hr.subsidiaryID,
				Date:         exDateStr,
				Type:         jType,
				Description:  narration,
				Lines: []finance.JournalLineInput{
					{AccountCode: inst.GLAccountCode, AccountName: bankName, Narration: narration, Debit: grossCash},
					{AccountCode: inst.IncomeGLCode, AccountName: incomeName, Narration: narration, Credit: grossCash},
					{AccountCode: inst.IncomeGLCode, AccountName: incomeName, Narration: "WHT deducted – " + inst.Ticker, Debit: wht},
					{AccountCode: "2201", AccountName: whtName, Narration: "WHT deducted – " + inst.Ticker, Credit: wht},
				},
			})
			if err != nil {
				return nil, fmt.Errorf("portfolio: create journal for fund %s: %w", hr.fundID, err)
			}
			if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
				return nil, fmt.Errorf("portfolio: post journal for fund %s: %w", hr.fundID, err)
			}
			jID := journal.ID
			impact.JournalID = &jID

			// Record portfolio.transaction for this fund.
			ref := fmt.Sprintf("CA/%s/%s/%s", txnType[:3], inst.Ticker, exDateStr)
			if _, err := tx.Exec(ctx, `
				INSERT INTO portfolio.transaction
				    (fund_id, instrument_id, txn_type, trade_date,
				     gross_amount, net_amount,
				     reference, narration, status, journal_id,
				     created_by, created_by_name)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'settled',$9,$10,$11)
			`, hr.fundID, action.InstrumentID, txnType, exDateStr,
				grossCash, netCash,
				ref, narration, journal.ID, byID, byName,
			); err != nil {
				return nil, fmt.Errorf("portfolio: record transaction for fund %s: %w", hr.fundID, err)
			}

			// Increase fund AUM by net cash received.
			if _, err := tx.Exec(ctx, `UPDATE portfolio.fund SET aum = aum + $2 WHERE id = $1`, hr.fundID, netCash); err != nil {
				return nil, fmt.Errorf("portfolio: update aum for fund %s: %w", hr.fundID, err)
			}

		// ── Stock split ────────────────────────────────────────────────────────
		case CorporateActionStockSplit:
			if action.SplitRatio <= 0 {
				return nil, fmt.Errorf("portfolio: invalid split_ratio %.6f", action.SplitRatio)
			}
			newQty := round2(hr.quantity * action.SplitRatio)
			newAvgCost := round2(hr.avgCost / action.SplitRatio)

			impact.HoldingQuantityAfter = newQty

			if _, err := tx.Exec(ctx, `
				UPDATE portfolio.holding
				SET    quantity   = $3,
				       avg_cost   = $4,
				       updated_at = now()
				WHERE  id = $1 AND fund_id = $2
			`, hr.holdingID, hr.fundID, newQty, newAvgCost); err != nil {
				return nil, fmt.Errorf("portfolio: update holding (split) for fund %s: %w", hr.fundID, err)
			}

			// Insert adjusted price on ex_date (old price / split_ratio).
			// Fetch latest price as reference.
			var latestPrice float64
			_ = s.pool.QueryRow(ctx, `
				SELECT COALESCE(close_price::float8, 0)
				FROM   portfolio.price
				WHERE  instrument_id = $1
				ORDER  BY price_date DESC
				LIMIT  1
			`, action.InstrumentID).Scan(&latestPrice)

			if latestPrice > 0 {
				adjustedPrice := round2(latestPrice / action.SplitRatio)
				if _, err := tx.Exec(ctx, `
					INSERT INTO portfolio.price (instrument_id, price_date, close_price, source)
					VALUES ($1,$2,$3,'corporate_action')
					ON CONFLICT (instrument_id, price_date) DO UPDATE
					SET close_price = EXCLUDED.close_price, source = EXCLUDED.source
				`, action.InstrumentID, exDateStr, adjustedPrice); err != nil {
					return nil, fmt.Errorf("portfolio: insert adjusted price (split): %w", err)
				}
				// Recalculate market value and unrealized PnL for this holding.
				if _, err := tx.Exec(ctx, `
					UPDATE portfolio.holding
					SET    market_price   = $2,
					       market_value   = ROUND(quantity * $2, 2),
					       unrealized_pnl = ROUND(quantity * $2 - book_value, 2),
					       last_priced_at = now(),
					       updated_at     = now()
					WHERE  id = $1
				`, hr.holdingID, adjustedPrice); err != nil {
					return nil, fmt.Errorf("portfolio: reprice after split for fund %s: %w", hr.fundID, err)
				}
			}

		// ── Bonus share ────────────────────────────────────────────────────────
		case CorporateActionBonusShare:
			if action.BonusRatio <= 0 {
				return nil, fmt.Errorf("portfolio: invalid bonus_ratio %.6f", action.BonusRatio)
			}
			bonusQty := round2(hr.quantity * action.BonusRatio)
			newQty := round2(hr.quantity + bonusQty)

			// Bonus shares carry zero additional cost; avg_cost dilutes proportionally
			// so book_value stays the same (bonus shares have zero cost basis).
			newAvgCost := round2(hr.bookValue / newQty)

			impact.HoldingQuantityAfter = newQty

			if _, err := tx.Exec(ctx, `
				UPDATE portfolio.holding
				SET    quantity   = $3,
				       avg_cost   = $4,
				       updated_at = now()
				WHERE  id = $1 AND fund_id = $2
			`, hr.holdingID, hr.fundID, newQty, newAvgCost); err != nil {
				return nil, fmt.Errorf("portfolio: update holding (bonus) for fund %s: %w", hr.fundID, err)
			}

			narration := fmt.Sprintf("Bonus share – %s – ratio %.4f – %s", inst.Ticker, action.BonusRatio, exDateStr)
			ref := fmt.Sprintf("CA/BON/%s/%s", inst.Ticker, exDateStr)
			if _, err := tx.Exec(ctx, `
				INSERT INTO portfolio.transaction
				    (fund_id, instrument_id, txn_type, trade_date,
				     quantity, gross_amount, net_amount,
				     reference, narration, status,
				     created_by, created_by_name)
				VALUES ($1,$2,'bonus_share',$3,$4,0,0,$5,$6,'settled',$7,$8)
			`, hr.fundID, action.InstrumentID, exDateStr,
				bonusQty, ref, narration, byID, byName,
			); err != nil {
				return nil, fmt.Errorf("portfolio: record bonus_share transaction for fund %s: %w", hr.fundID, err)
			}

		// ── Rights issue ────────────────────────────────────────────────────────
		case CorporateActionRightsIssue:
			if action.RightsRatio <= 0 || action.RightsPrice <= 0 {
				return nil, fmt.Errorf("portfolio: rights_ratio and rights_price must be positive")
			}
			rightsQty := math.Floor(hr.quantity * action.RightsRatio)
			if rightsQty <= 0 {
				impact.HoldingQuantityAfter = hr.quantity
				break
			}

			grossCost := round2(rightsQty * action.RightsPrice)
			impact.HoldingQuantityAfter = round2(hr.quantity + rightsQty)

			// Update holding: add rights qty at rights_price (weighted avg cost).
			newTotalQty := round2(hr.quantity + rightsQty)
			newBookValue := round2(hr.bookValue + grossCost)
			newAvgCost := round2(newBookValue / newTotalQty)

			if _, err := tx.Exec(ctx, `
				UPDATE portfolio.holding
				SET    quantity    = $3,
				       avg_cost    = $4,
				       book_value  = $5,
				       updated_at  = now()
				WHERE  id = $1 AND fund_id = $2
			`, hr.holdingID, hr.fundID, newTotalQty, newAvgCost, newBookValue); err != nil {
				return nil, fmt.Errorf("portfolio: update holding (rights) for fund %s: %w", hr.fundID, err)
			}

			// GL journal: Dr Investment account / Cr Bank
			narration := fmt.Sprintf("Rights issue – %s – %.0f units @ ₦%.4f – %s", inst.Ticker, rightsQty, action.RightsPrice, exDateStr)
			bankCode := "1110"
			bankAccountName := glName(bankCode)

			journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
				SubsidiaryID: hr.subsidiaryID,
				Date:         exDateStr,
				Type:         "Rights Issue",
				Description:  narration,
				Lines: []finance.JournalLineInput{
					{AccountCode: inst.GLAccountCode, AccountName: bankName, Narration: narration, Debit: grossCost},
					{AccountCode: bankCode, AccountName: bankAccountName, Narration: narration, Credit: grossCost},
				},
			})
			if err != nil {
				return nil, fmt.Errorf("portfolio: create journal (rights) for fund %s: %w", hr.fundID, err)
			}
			if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
				return nil, fmt.Errorf("portfolio: post journal (rights) for fund %s: %w", hr.fundID, err)
			}
			jID := journal.ID
			impact.JournalID = &jID

			ref := fmt.Sprintf("CA/RTS/%s/%s", inst.Ticker, exDateStr)
			if _, err := tx.Exec(ctx, `
				INSERT INTO portfolio.transaction
				    (fund_id, instrument_id, txn_type, trade_date,
				     quantity, price, gross_amount, net_amount,
				     reference, narration, status, journal_id,
				     created_by, created_by_name)
				VALUES ($1,$2,'buy',$3,$4,$5,$6,$6,$7,$8,'settled',$9,$10,$11)
			`, hr.fundID, action.InstrumentID, exDateStr,
				rightsQty, action.RightsPrice, grossCost,
				ref, narration, journal.ID, byID, byName,
			); err != nil {
				return nil, fmt.Errorf("portfolio: record rights buy for fund %s: %w", hr.fundID, err)
			}

			// Reduce fund cash (bank AUM not changed — just internal reallocation within fund assets).

		// ── Stock dividend (share-in-lieu) ─────────────────────────────────────
		case CorporateActionStockDividend:
			// Stock dividends: distribute shares instead of cash.
			// Qty of shares = (dividend_amount / current_market_price) per unit.
			// Simplification: treat amount_per_unit as direct share ratio (shares per share held).
			extraQty := round2(hr.quantity * action.AmountPerUnit)
			newQty := round2(hr.quantity + extraQty)
			newAvgCost := round2(hr.bookValue / newQty)

			impact.HoldingQuantityAfter = newQty

			if _, err := tx.Exec(ctx, `
				UPDATE portfolio.holding
				SET    quantity   = $3,
				       avg_cost   = $4,
				       updated_at = now()
				WHERE  id = $1 AND fund_id = $2
			`, hr.holdingID, hr.fundID, newQty, newAvgCost); err != nil {
				return nil, fmt.Errorf("portfolio: update holding (stock_dividend) for fund %s: %w", hr.fundID, err)
			}

			narration := fmt.Sprintf("Stock dividend – %s – ratio %.4f – %s", inst.Ticker, action.AmountPerUnit, exDateStr)
			ref := fmt.Sprintf("CA/SDV/%s/%s", inst.Ticker, exDateStr)
			if _, err := tx.Exec(ctx, `
				INSERT INTO portfolio.transaction
				    (fund_id, instrument_id, txn_type, trade_date,
				     quantity, gross_amount, net_amount,
				     reference, narration, status,
				     created_by, created_by_name)
				VALUES ($1,$2,'dividend',$3,$4,0,0,$5,$6,'settled',$7,$8)
			`, hr.fundID, action.InstrumentID, exDateStr,
				extraQty, ref, narration, byID, byName,
			); err != nil {
				return nil, fmt.Errorf("portfolio: record stock_dividend transaction for fund %s: %w", hr.fundID, err)
			}

		// ── Maturity (fixed income / money market) ─────────────────────────────
		case CorporateActionMaturity:
			// On maturity the principal is returned at face/book value.
			// We treat this like a full sale at avg_cost (no gain/loss on principal).
			// Interest income should have already been booked via coupon/income transactions.
			principalReturned := round2(hr.quantity * hr.avgCost)

			impact.HoldingQuantityAfter = 0
			impact.CashDistributed = principalReturned
			impact.NetCash = principalReturned

			narration := fmt.Sprintf("Maturity – %s – %s", inst.Ticker, exDateStr)

			journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
				SubsidiaryID: hr.subsidiaryID,
				Date:         exDateStr,
				Type:         "Maturity",
				Description:  narration,
				Lines: []finance.JournalLineInput{
					// Dr Bank (principal returned in cash)
					{AccountCode: "1110", AccountName: glName("1110"), Narration: narration, Debit: principalReturned},
					// Cr Investment account (remove the asset)
					{AccountCode: inst.GLAccountCode, AccountName: bankName, Narration: narration, Credit: principalReturned},
				},
			})
			if err != nil {
				return nil, fmt.Errorf("portfolio: create journal (maturity) for fund %s: %w", hr.fundID, err)
			}
			if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
				return nil, fmt.Errorf("portfolio: post journal (maturity) for fund %s: %w", hr.fundID, err)
			}
			jID := journal.ID
			impact.JournalID = &jID

			// Zero out the holding.
			if _, err := tx.Exec(ctx, `
				UPDATE portfolio.holding
				SET    quantity    = 0,
				       book_value  = 0,
				       market_value  = 0,
				       unrealized_pnl = 0,
				       updated_at  = now()
				WHERE  id = $1 AND fund_id = $2
			`, hr.holdingID, hr.fundID); err != nil {
				return nil, fmt.Errorf("portfolio: zero holding (maturity) for fund %s: %w", hr.fundID, err)
			}

			ref := fmt.Sprintf("CA/MAT/%s/%s", inst.Ticker, exDateStr)
			if _, err := tx.Exec(ctx, `
				INSERT INTO portfolio.transaction
				    (fund_id, instrument_id, txn_type, trade_date,
				     quantity, price, gross_amount, net_amount,
				     reference, narration, status, journal_id,
				     created_by, created_by_name)
				VALUES ($1,$2,'sell',$3,$4,$5,$6,$6,$7,$8,'settled',$9,$10,$11)
			`, hr.fundID, action.InstrumentID, exDateStr,
				hr.quantity, hr.avgCost, principalReturned,
				ref, narration, journal.ID, byID, byName,
			); err != nil {
				return nil, fmt.Errorf("portfolio: record maturity transaction for fund %s: %w", hr.fundID, err)
			}

			// Increase fund cash AUM (principal is now cash).
			if _, err := tx.Exec(ctx, `UPDATE portfolio.fund SET aum = aum + $2 WHERE id = $1`, hr.fundID, principalReturned); err != nil {
				return nil, fmt.Errorf("portfolio: update aum (maturity) for fund %s: %w", hr.fundID, err)
			}
		}

		// 4b. Save the impact record.
		if err := tx.QueryRow(ctx, `
			INSERT INTO portfolio.corporate_action_impact
			    (corporate_action_id, fund_id, instrument_id,
			     holding_quantity_before, holding_quantity_after,
			     cash_distributed, wht_deducted, net_cash, journal_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			RETURNING id, created_at
		`,
			id, hr.fundID, action.InstrumentID,
			impact.HoldingQuantityBefore, impact.HoldingQuantityAfter,
			impact.CashDistributed, impact.WHTDeducted, impact.NetCash,
			impact.JournalID,
		).Scan(&impact.ID, &impact.CreatedAt); err != nil {
			return nil, fmt.Errorf("portfolio: insert impact for fund %s: %w", hr.fundID, err)
		}

		impacts = append(impacts, impact)
	}

	// 5. Mark action as processed.
	now := time.Now()
	if _, err := tx.Exec(ctx, `
		UPDATE portfolio.corporate_action
		SET    status       = 'processed',
		       processed_at = $2,
		       processed_by = $3,
		       updated_at   = now()
		WHERE  id = $1
	`, id, now, byID); err != nil {
		return nil, fmt.Errorf("portfolio: mark processed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("portfolio: commit corporate action: %w", err)
	}

	return impacts, nil
}

// ── Scanners ──────────────────────────────────────────────────────────────────

type scannable interface {
	Scan(...any) error
}

func scanCorporateAction(row scannable, ca *CorporateAction) error {
	return row.Scan(
		&ca.ID, &ca.InstrumentID, &ca.InstrumentName, &ca.Ticker,
		&ca.ActionType, &ca.ExDate, &ca.RecordDate, &ca.PayDate,
		&ca.AmountPerUnit, &ca.Currency,
		&ca.SplitRatio, &ca.BonusRatio, &ca.RightsRatio, &ca.RightsPrice,
		&ca.Status, &ca.Notes,
		&ca.ProcessedAt, &ca.ProcessedBy,
		&ca.CreatedBy, &ca.CreatedByName, &ca.CreatedAt,
	)
}

func scanCorporateActions(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]CorporateAction, error) {
	var out []CorporateAction
	for rows.Next() {
		var ca CorporateAction
		if err := scanCorporateAction(rows, &ca); err != nil {
			return nil, err
		}
		out = append(out, ca)
	}
	return out, rows.Err()
}
