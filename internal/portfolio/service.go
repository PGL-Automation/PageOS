// Package portfolio manages investment funds, securities, holdings, and trades.
// Every transaction auto-posts a double-entry journal to the finance GL.
package portfolio

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/finance"
)

type Service struct {
	pool       *pgxpool.Pool
	financeSvc *finance.Service
}

func NewService(pool *pgxpool.Pool, financeSvc *finance.Service) *Service {
	return &Service{pool: pool, financeSvc: financeSvc}
}

// ── Domain types ──────────────────────────────────────────────────────────────

type Instrument struct {
	ID            uuid.UUID `json:"id"`
	Ticker        string    `json:"ticker"`
	Name          string    `json:"name"`
	AssetClass    string    `json:"asset_class"`
	Exchange      string    `json:"exchange"`
	Currency      string    `json:"currency"`
	FaceValue     *float64  `json:"face_value,omitempty"`
	CouponRate    *float64  `json:"coupon_rate,omitempty"`
	MaturityDate  *string   `json:"maturity_date,omitempty"`
	Issuer        string    `json:"issuer"`
	Sector        string    `json:"sector"`
	GLAccountCode string    `json:"gl_account_code"`
	GainGLCode    string    `json:"gain_gl_code"`
	LossGLCode    string    `json:"loss_gl_code"`
	CostGLCode    string    `json:"cost_gl_code"`
	IncomeGLCode  string    `json:"income_gl_code"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
}

type Fund struct {
	ID             uuid.UUID  `json:"id"`
	Code           string     `json:"code"`
	Name           string     `json:"name"`
	FundType       string     `json:"fund_type"`
	Benchmark      string     `json:"benchmark"`
	Currency       string     `json:"currency"`
	InceptionDate  string     `json:"inception_date"`
	TargetReturn   *float64   `json:"target_return,omitempty"`
	Status         string     `json:"status"`
	ClientID       *uuid.UUID `json:"client_id,omitempty"`
	SubsidiaryID   *uuid.UUID `json:"subsidiary_id,omitempty"`
	AUM            float64    `json:"aum"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
}

type Holding struct {
	ID             uuid.UUID `json:"id"`
	FundID         uuid.UUID `json:"fund_id"`
	FundName       string    `json:"fund_name"`
	InstrumentID   uuid.UUID `json:"instrument_id"`
	Ticker         string    `json:"ticker"`
	InstrumentName string    `json:"instrument_name"`
	AssetClass     string    `json:"asset_class"`
	Quantity       float64   `json:"quantity"`
	AvgCost        float64   `json:"avg_cost"`
	BookValue      float64   `json:"book_value"`
	MarketPrice    *float64  `json:"market_price,omitempty"`
	MarketValue    *float64  `json:"market_value,omitempty"`
	UnrealizedPnL  *float64  `json:"unrealized_pnl,omitempty"`
	LastPricedAt   *string   `json:"last_priced_at,omitempty"`
}

type Transaction struct {
	ID             uuid.UUID  `json:"id"`
	FundID         uuid.UUID  `json:"fund_id"`
	FundName       string     `json:"fund_name"`
	InstrumentID   *uuid.UUID `json:"instrument_id,omitempty"`
	Ticker         string     `json:"ticker,omitempty"`
	InstrumentName string     `json:"instrument_name,omitempty"`
	TxnType        string     `json:"txn_type"`
	TradeDate      string     `json:"trade_date"`
	SettlementDate *string    `json:"settlement_date,omitempty"`
	Quantity       *float64   `json:"quantity,omitempty"`
	Price          *float64   `json:"price,omitempty"`
	GrossAmount    float64    `json:"gross_amount"`
	Fees           float64    `json:"fees"`
	NetAmount      float64    `json:"net_amount"`
	RealizedPnL    float64    `json:"realized_pnl"`
	Currency       string     `json:"currency"`
	Reference      string     `json:"reference"`
	Narration      string     `json:"narration"`
	Status         string     `json:"status"`
	JournalID      *uuid.UUID `json:"journal_id,omitempty"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ── GL account defaults by asset class ───────────────────────────────────────

var classGLDefaults = map[string][5]string{
	// [investment_account, gain_account, loss_account, cost_account, income_account]
	"equity":          {"1201", "4013", "5803", "5800", "4011"},
	"fixed_income":    {"1202", "4014", "5803", "5801", "4012"},
	"money_market":    {"1203", "4014", "5803", "5801", "4010"},
	"real_estate":     {"1204", "4013", "5803", "5800", "4010"},
	"cash_equivalent": {"1203", "4014", "5803", "5801", "4010"},
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// ── Instruments ───────────────────────────────────────────────────────────────

type CreateInstrumentInput struct {
	Ticker       string   `json:"ticker"`
	Name         string   `json:"name"`
	AssetClass   string   `json:"asset_class"`
	Exchange     string   `json:"exchange"`
	Currency     string   `json:"currency"`
	FaceValue    *float64 `json:"face_value"`
	CouponRate   *float64 `json:"coupon_rate"`
	MaturityDate string   `json:"maturity_date"`
	Issuer       string   `json:"issuer"`
	Sector       string   `json:"sector"`
}

func (s *Service) CreateInstrument(ctx context.Context, in CreateInstrumentInput) (Instrument, error) {
	if in.Ticker == "" || in.Name == "" || in.AssetClass == "" {
		return Instrument{}, fmt.Errorf("portfolio: ticker, name, asset_class required")
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}
	codes := classGLDefaults[in.AssetClass]
	var matDate *string
	if in.MaturityDate != "" {
		matDate = &in.MaturityDate
	}
	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.instrument
		    (ticker, name, asset_class, exchange, currency,
		     face_value, coupon_rate, maturity_date, issuer, sector,
		     gl_account_code, gain_gl_code, loss_gl_code, cost_gl_code, income_gl_code)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id
	`, in.Ticker, in.Name, in.AssetClass, in.Exchange, in.Currency,
		in.FaceValue, in.CouponRate, matDate, in.Issuer, in.Sector,
		codes[0], codes[1], codes[2], codes[3], codes[4],
	).Scan(&id); err != nil {
		return Instrument{}, fmt.Errorf("portfolio: create instrument: %w", err)
	}
	return s.getInstrument(ctx, id)
}

func (s *Service) ListInstruments(ctx context.Context, assetClass string, activeOnly bool) ([]Instrument, error) {
	const q = `
		SELECT id, ticker, name, asset_class, exchange, currency,
		       face_value, coupon_rate, maturity_date::text,
		       issuer, sector, gl_account_code, gain_gl_code, loss_gl_code,
		       cost_gl_code, income_gl_code, is_active, created_at
		FROM   portfolio.instrument
		WHERE  ($1 = '' OR asset_class = $1)
		  AND  (NOT $2     OR is_active = true)
		ORDER  BY asset_class, ticker
	`
	rows, err := s.pool.Query(ctx, q, assetClass, activeOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInstruments(rows)
}

func (s *Service) getInstrument(ctx context.Context, id uuid.UUID) (Instrument, error) {
	var inst Instrument
	var matDate *string
	if err := s.pool.QueryRow(ctx, `
		SELECT id, ticker, name, asset_class, exchange, currency,
		       face_value, coupon_rate, maturity_date::text,
		       issuer, sector, gl_account_code, gain_gl_code, loss_gl_code,
		       cost_gl_code, income_gl_code, is_active, created_at
		FROM   portfolio.instrument WHERE id = $1
	`, id).Scan(
		&inst.ID, &inst.Ticker, &inst.Name, &inst.AssetClass, &inst.Exchange, &inst.Currency,
		&inst.FaceValue, &inst.CouponRate, &matDate,
		&inst.Issuer, &inst.Sector, &inst.GLAccountCode, &inst.GainGLCode, &inst.LossGLCode,
		&inst.CostGLCode, &inst.IncomeGLCode, &inst.IsActive, &inst.CreatedAt,
	); err != nil {
		return Instrument{}, err
	}
	inst.MaturityDate = matDate
	return inst, nil
}

// ── Funds ─────────────────────────────────────────────────────────────────────

type CreateFundInput struct {
	Code          string     `json:"code"`
	Name          string     `json:"name"`
	FundType      string     `json:"fund_type"`
	Benchmark     string     `json:"benchmark"`
	Currency      string     `json:"currency"`
	InceptionDate string     `json:"inception_date"`
	TargetReturn  *float64   `json:"target_return"`
	ClientID      *uuid.UUID `json:"client_id"`
	SubsidiaryID  *uuid.UUID `json:"subsidiary_id"`
	// Tenor and early liquidation terms
	TenorDays              *int     `json:"tenor_days"`
	LockUpDays             int      `json:"lock_up_days"`
	EarlyRedemptionAllowed *bool    `json:"early_redemption_allowed"`
	PenaltyType            string   `json:"penalty_type"` // none|reduced_rate|flat_fee|interest_forfeit
	FullRate               *float64 `json:"full_rate"`
	EarlyExitRate          *float64 `json:"early_exit_rate"`
	PenaltyRate            *float64 `json:"penalty_rate"`
	NoticePeriodDays       int      `json:"notice_period_days"`
}

func (s *Service) CreateFund(ctx context.Context, in CreateFundInput, byID uuid.UUID, byName string) (Fund, error) {
	if in.Code == "" || in.Name == "" || in.FundType == "" || in.InceptionDate == "" {
		return Fund{}, fmt.Errorf("portfolio: code, name, fund_type, inception_date required")
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}
	earlyAllowed := true
	if in.EarlyRedemptionAllowed != nil {
		earlyAllowed = *in.EarlyRedemptionAllowed
	}
	penaltyType := in.PenaltyType
	if penaltyType == "" {
		penaltyType = "none"
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.fund
		    (code, name, fund_type, benchmark, currency, inception_date,
		     target_return, client_id, subsidiary_id,
		     tenor_days, lock_up_days, early_redemption_allowed,
		     penalty_type, full_rate, early_exit_rate, penalty_rate, notice_period_days,
		     created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id
	`, in.Code, in.Name, in.FundType, in.Benchmark, in.Currency, in.InceptionDate,
		in.TargetReturn, in.ClientID, in.SubsidiaryID,
		in.TenorDays, in.LockUpDays, earlyAllowed,
		penaltyType, in.FullRate, in.EarlyExitRate, in.PenaltyRate, in.NoticePeriodDays,
		byID, byName,
	).Scan(&id); err != nil {
		return Fund{}, fmt.Errorf("portfolio: create fund: %w", err)
	}
	return s.getFund(ctx, id)
}

func (s *Service) ListFunds(ctx context.Context, subsidiaryID *uuid.UUID) ([]Fund, error) {
	const q = `
		SELECT id, code, name, fund_type, benchmark, currency,
		       inception_date::text, target_return, status, client_id,
		       subsidiary_id, aum::float8, created_by_name, created_at
		FROM   portfolio.fund
		WHERE  ($1 = '' OR subsidiary_id::text = $1)
		ORDER  BY name
	`
	sub := ""
	if subsidiaryID != nil {
		sub = subsidiaryID.String()
	}
	rows, err := s.pool.Query(ctx, q, sub)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFunds(rows)
}

// GetFundByID is the exported version of getFund for use by the HTTP handler.
func (s *Service) GetFundByID(ctx context.Context, id uuid.UUID) (Fund, error) {
	return s.getFund(ctx, id)
}

func (s *Service) getFund(ctx context.Context, id uuid.UUID) (Fund, error) {
	var f Fund
	if err := s.pool.QueryRow(ctx, `
		SELECT id, code, name, fund_type, benchmark, currency,
		       inception_date::text, target_return, status, client_id,
		       subsidiary_id, aum::float8, created_by_name, created_at
		FROM   portfolio.fund WHERE id = $1
	`, id).Scan(
		&f.ID, &f.Code, &f.Name, &f.FundType, &f.Benchmark, &f.Currency,
		&f.InceptionDate, &f.TargetReturn, &f.Status, &f.ClientID,
		&f.SubsidiaryID, &f.AUM, &f.CreatedByName, &f.CreatedAt,
	); err != nil {
		return Fund{}, fmt.Errorf("portfolio: fund not found: %w", err)
	}
	return f, nil
}

// ── Holdings ──────────────────────────────────────────────────────────────────

func (s *Service) GetHoldings(ctx context.Context, fundID uuid.UUID) ([]Holding, error) {
	const q = `
		SELECT h.id, h.fund_id, f.name, h.instrument_id,
		       i.ticker, i.name, i.asset_class,
		       h.quantity::float8, h.avg_cost::float8, h.book_value::float8,
		       h.market_price::float8, h.market_value::float8, h.unrealized_pnl::float8,
		       h.last_priced_at::text
		FROM   portfolio.holding h
		JOIN   portfolio.fund       f ON f.id = h.fund_id
		JOIN   portfolio.instrument i ON i.id = h.instrument_id
		WHERE  h.fund_id = $1 AND h.quantity > 0
		ORDER  BY i.asset_class, i.ticker
	`
	rows, err := s.pool.Query(ctx, q, fundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Holding
	for rows.Next() {
		var h Holding
		if err := rows.Scan(
			&h.ID, &h.FundID, &h.FundName, &h.InstrumentID,
			&h.Ticker, &h.InstrumentName, &h.AssetClass,
			&h.Quantity, &h.AvgCost, &h.BookValue,
			&h.MarketPrice, &h.MarketValue, &h.UnrealizedPnL,
			&h.LastPricedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ── Trade booking ─────────────────────────────────────────────────────────────

type TradeInput struct {
	FundID         uuid.UUID `json:"fund_id"`
	InstrumentID   uuid.UUID `json:"instrument_id"`
	TxnType        string    `json:"txn_type"` // buy | sell
	TradeDate      string    `json:"trade_date"`
	SettlementDate string    `json:"settlement_date"`
	Quantity       float64   `json:"quantity"`
	Price          float64   `json:"price"`
	Fees           float64   `json:"fees"`
	BankCode       string    `json:"bank_account_code"` // GL code of bank (1110–1114)
	Narration      string    `json:"narration"`
}

// BookTrade records a buy or sell and posts the corresponding GL journal.
//
// Buy: Dr investment_account / Cr bank (gross + fees split if any)
// Sell (gain): Dr bank / Cr investment_account (cost) / Cr gain_account
// Sell (loss): Dr bank + Dr loss_account / Cr investment_account (cost)
func (s *Service) BookTrade(ctx context.Context, in TradeInput, byID uuid.UUID, byName string) (Transaction, error) {
	if in.TxnType != "buy" && in.TxnType != "sell" {
		return Transaction{}, fmt.Errorf("portfolio: txn_type must be 'buy' or 'sell'")
	}
	if in.Quantity <= 0 || in.Price <= 0 {
		return Transaction{}, fmt.Errorf("portfolio: quantity and price must be positive")
	}
	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	fund, err := s.getFund(ctx, in.FundID)
	if err != nil {
		return Transaction{}, err
	}
	inst, err := s.getInstrument(ctx, in.InstrumentID)
	if err != nil {
		return Transaction{}, err
	}

	gross := round2(in.Quantity * in.Price)
	fees := round2(in.Fees)
	var netAmount float64
	if in.TxnType == "buy" {
		netAmount = round2(gross + fees) // cash out = gross + fees
	} else {
		netAmount = round2(gross - fees) // cash in = gross - fees
	}

	// Get account names for the journal
	bankName, investName, gainName, lossName, costName := "Cash at Bank", inst.Name, "Capital Gains", "Realised Losses", "Transaction Costs"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, inst.GLAccountCode).Scan(&investName)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, inst.GainGLCode).Scan(&gainName)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, inst.LossGLCode).Scan(&lossName)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, inst.CostGLCode).Scan(&costName)

	narration := in.Narration
	if narration == "" {
		narration = fmt.Sprintf("%s %s × %.4f @ ₦%.4f – %s", in.TxnType, inst.Ticker, in.Quantity, in.Price, in.TradeDate)
	}

	var lines []finance.JournalLineInput
	var realizedPnL float64

	if in.TxnType == "buy" {
		lines = []finance.JournalLineInput{
			{AccountCode: inst.GLAccountCode, AccountName: investName, Narration: narration, Debit: gross},
			{AccountCode: in.BankCode, AccountName: bankName, Narration: narration, Credit: gross},
		}
		if fees > 0 {
			lines = append(lines,
				finance.JournalLineInput{AccountCode: inst.CostGLCode, AccountName: costName, Narration: "Transaction costs – " + inst.Ticker, Debit: fees},
				finance.JournalLineInput{AccountCode: in.BankCode, AccountName: bankName, Narration: "Transaction costs – " + inst.Ticker, Credit: fees},
			)
		}
	} else {
		// Sell: need to know the cost basis of the units being sold
		var avgCost float64
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(avg_cost,0)::float8 FROM portfolio.holding WHERE fund_id=$1 AND instrument_id=$2`, in.FundID, in.InstrumentID).Scan(&avgCost)
		costBasis := round2(in.Quantity * avgCost)

		// Economic gain/loss (net of fees) — used for holding update and AUM.
		realizedPnL = round2(gross - costBasis - fees)

		// Journal gain/loss is gross of fees (fees posted as a separate debit line).
		// Structure: Dr Bank(gross) / Cr Investment(costBasis) ± Cr/Dr Gain/Loss(gross-costBasis)
		//            + Dr Costs(fees) / Cr Bank(fees)   [if fees > 0]
		// This ensures debits = credits regardless of fee size.
		journalGainLoss := round2(gross - costBasis)

		lines = []finance.JournalLineInput{
			{AccountCode: in.BankCode, AccountName: bankName, Narration: narration, Debit: gross},
			{AccountCode: inst.GLAccountCode, AccountName: investName, Narration: narration, Credit: costBasis},
		}
		if fees > 0 {
			lines = append(lines,
				finance.JournalLineInput{AccountCode: inst.CostGLCode, AccountName: costName, Narration: "Transaction costs – " + inst.Ticker, Debit: fees},
				finance.JournalLineInput{AccountCode: in.BankCode, AccountName: bankName, Narration: "Transaction costs – " + inst.Ticker, Credit: fees},
			)
		}
		if journalGainLoss > 0 {
			lines = append(lines, finance.JournalLineInput{AccountCode: inst.GainGLCode, AccountName: gainName, Narration: "Gain on disposal – " + inst.Ticker, Credit: journalGainLoss})
		} else if journalGainLoss < 0 {
			lines = append(lines, finance.JournalLineInput{AccountCode: inst.LossGLCode, AccountName: lossName, Narration: "Loss on disposal – " + inst.Ticker, Debit: -journalGainLoss})
		}
	}

	jType := "Transaction Costs – Equities"
	if inst.AssetClass == "fixed_income" || inst.AssetClass == "money_market" {
		jType = "Transaction Costs – Fixed Income"
	}
	if in.TxnType == "buy" {
		jType = fmt.Sprintf("Purchase – %s", inst.AssetClass)
	} else {
		jType = fmt.Sprintf("Sale – %s", inst.AssetClass)
	}

	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: fund.SubsidiaryID,
		Date:         in.TradeDate,
		Type:         jType,
		Description:  narration,
		Lines:        lines,
	})
	if err != nil {
		return Transaction{}, fmt.Errorf("portfolio: create journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return Transaction{}, fmt.Errorf("portfolio: post journal: %w", err)
	}

	// Generate reference
	ref := fmt.Sprintf("TRD/%s/%s/%s", inst.Ticker, in.TxnType[:1], in.TradeDate)

	var settleDate *string
	if in.SettlementDate != "" {
		s2 := in.SettlementDate
		settleDate = &s2
	}

	// Record transaction
	var txID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.transaction
		    (fund_id, instrument_id, txn_type, trade_date, settlement_date,
		     quantity, price, gross_amount, fees, net_amount, realized_pnl,
		     reference, narration, status, journal_id, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'settled',$14,$15,$16)
		RETURNING id
	`, in.FundID, in.InstrumentID, in.TxnType, in.TradeDate, settleDate,
		in.Quantity, in.Price, gross, fees, netAmount, realizedPnL,
		ref, narration, journal.ID, byID, byName,
	).Scan(&txID); err != nil {
		return Transaction{}, fmt.Errorf("portfolio: record transaction: %w", err)
	}

	// Update holding (weighted average cost)
	if in.TxnType == "buy" {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO portfolio.holding (fund_id, instrument_id, quantity, avg_cost, book_value)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (fund_id, instrument_id) DO UPDATE
			SET quantity   = portfolio.holding.quantity + EXCLUDED.quantity,
			    avg_cost   = (portfolio.holding.book_value + EXCLUDED.book_value)
			                  / (portfolio.holding.quantity + EXCLUDED.quantity),
			    book_value  = portfolio.holding.book_value + EXCLUDED.book_value,
			    updated_at  = now()
		`, in.FundID, in.InstrumentID, in.Quantity, in.Price, gross); err != nil {
			return Transaction{}, fmt.Errorf("portfolio: update holding: %w", err)
		}
	} else {
		if _, err := s.pool.Exec(ctx, `
			UPDATE portfolio.holding
			SET    quantity   = quantity - $3,
			       book_value = GREATEST(0, book_value - ($3 * avg_cost)),
			       updated_at = now()
			WHERE  fund_id = $1 AND instrument_id = $2
		`, in.FundID, in.InstrumentID, in.Quantity); err != nil {
			return Transaction{}, fmt.Errorf("portfolio: reduce holding: %w", err)
		}
	}

	// Update AUM
	aumDelta := netAmount
	if in.TxnType == "buy" {
		aumDelta = 0 // no change to AUM on buy (cash → investment, same AUM)
	}
	_ = s.pool.QueryRow(ctx, `UPDATE portfolio.fund SET aum = aum - $2 WHERE id = $1 RETURNING aum`, in.FundID, aumDelta)

	return s.getTransaction(ctx, txID)
}

// ── Income recording (dividend, coupon, interest) ─────────────────────────────

type IncomeInput struct {
	FundID       uuid.UUID  `json:"fund_id"`
	InstrumentID *uuid.UUID `json:"instrument_id"`
	IncomeType   string     `json:"income_type"` // dividend | coupon | interest
	Date         string     `json:"date"`
	Amount       float64    `json:"amount"`
	BankCode     string     `json:"bank_account_code"`
	Narration    string     `json:"narration"`
}

func (s *Service) RecordIncome(ctx context.Context, in IncomeInput, byID uuid.UUID, byName string) (Transaction, error) {
	if in.Amount <= 0 {
		return Transaction{}, fmt.Errorf("portfolio: amount must be positive")
	}
	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	fund, err := s.getFund(ctx, in.FundID)
	if err != nil {
		return Transaction{}, err
	}

	bankName := "Cash at Bank"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)

	var incomeName, incomeCode string
	switch in.IncomeType {
	case "dividend":
		incomeCode = "4011"
		incomeName = "Dividend Income"
	case "coupon":
		incomeCode = "4012"
		incomeName = "Coupon Income"
	default:
		incomeCode = "4010"
		incomeName = "Interest Income – Investments"
	}
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, incomeCode).Scan(&incomeName)

	narration := in.Narration
	if narration == "" && in.InstrumentID != nil {
		inst, _ := s.getInstrument(ctx, *in.InstrumentID)
		narration = fmt.Sprintf("%s – %s (%s)", in.IncomeType, inst.Ticker, in.Date)
	}

	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: fund.SubsidiaryID,
		Date:         in.Date,
		Type:         in.IncomeType,
		Description:  narration,
		Lines: []finance.JournalLineInput{
			{AccountCode: in.BankCode, AccountName: bankName, Narration: narration, Debit: in.Amount},
			{AccountCode: incomeCode, AccountName: incomeName, Narration: narration, Credit: in.Amount},
		},
	})
	if err != nil {
		return Transaction{}, err
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return Transaction{}, err
	}

	var txID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.transaction
		    (fund_id, instrument_id, txn_type, trade_date, gross_amount, net_amount,
		     reference, narration, status, journal_id, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'settled',$8,$9,$10)
		RETURNING id
	`, in.FundID, in.InstrumentID, in.IncomeType, in.Date, in.Amount,
		fmt.Sprintf("INC/%s/%s", in.IncomeType[:3], in.Date),
		narration, journal.ID, byID, byName,
	).Scan(&txID); err != nil {
		return Transaction{}, err
	}

	// Increase fund AUM
	_, _ = s.pool.Exec(ctx, `UPDATE portfolio.fund SET aum = aum + $2 WHERE id = $1`, in.FundID, in.Amount)

	return s.getTransaction(ctx, txID)
}

// ── Pricing ───────────────────────────────────────────────────────────────────

type PriceInput struct {
	InstrumentID uuid.UUID `json:"instrument_id"`
	Price        float64   `json:"price"`
	Date         string    `json:"price_date"`
	Source       string    `json:"source"`
}

// UpdatePrices saves closing prices and recalculates unrealized P&L on all holdings.
func (s *Service) UpdatePrices(ctx context.Context, prices []PriceInput) error {
	now := time.Now().Format("2006-01-02")
	for _, p := range prices {
		src := p.Source
		if src == "" {
			src = "manual"
		}
		d := p.Date
		if d == "" {
			d = now
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO portfolio.price (instrument_id, price_date, close_price, source)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (instrument_id, price_date) DO UPDATE
			SET close_price = EXCLUDED.close_price, source = EXCLUDED.source
		`, p.InstrumentID, d, p.Price, src); err != nil {
			return err
		}
		// Update all holdings for this instrument
		if _, err := s.pool.Exec(ctx, `
			UPDATE portfolio.holding
			SET    market_price    = $2,
			       market_value    = ROUND(quantity * $2, 2),
			       unrealized_pnl  = ROUND(quantity * $2 - book_value, 2),
			       last_priced_at  = now(),
			       updated_at      = now()
			WHERE  instrument_id = $1 AND quantity > 0
		`, p.InstrumentID, p.Price); err != nil {
			return err
		}
	}
	return nil
}

// ── Portfolio analytics ───────────────────────────────────────────────────────

type PortfolioSummary struct {
	FundID            uuid.UUID       `json:"fund_id"`
	FundName          string          `json:"fund_name"`
	TotalBookValue    float64         `json:"total_book_value"`
	TotalMarketValue  float64         `json:"total_market_value"`
	TotalUnrealizedPnL float64        `json:"total_unrealized_pnl"`
	AssetAllocation   []AllocationRow `json:"asset_allocation"`
}

type AllocationRow struct {
	AssetClass   string  `json:"asset_class"`
	BookValue    float64 `json:"book_value"`
	MarketValue  float64 `json:"market_value"`
	Pct          float64 `json:"pct"`
}

func (s *Service) GetPortfolioSummary(ctx context.Context, fundID uuid.UUID) (PortfolioSummary, error) {
	fund, err := s.getFund(ctx, fundID)
	if err != nil {
		return PortfolioSummary{}, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT i.asset_class,
		       COALESCE(SUM(h.book_value),0)::float8   AS book_value,
		       COALESCE(SUM(h.market_value),0)::float8 AS market_value
		FROM   portfolio.holding    h
		JOIN   portfolio.instrument i ON i.id = h.instrument_id
		WHERE  h.fund_id = $1 AND h.quantity > 0
		GROUP  BY i.asset_class
		ORDER  BY book_value DESC
	`, fundID)
	if err != nil {
		return PortfolioSummary{}, err
	}
	defer rows.Close()

	var alloc []AllocationRow
	var totalBook, totalMkt float64
	for rows.Next() {
		var a AllocationRow
		if err := rows.Scan(&a.AssetClass, &a.BookValue, &a.MarketValue); err != nil {
			return PortfolioSummary{}, err
		}
		alloc = append(alloc, a)
		totalBook += a.BookValue
		totalMkt += a.MarketValue
	}
	for i := range alloc {
		if totalMkt > 0 {
			alloc[i].Pct = round2(alloc[i].MarketValue / totalMkt * 100)
		}
	}
	return PortfolioSummary{
		FundID: fundID, FundName: fund.Name,
		TotalBookValue:     round2(totalBook),
		TotalMarketValue:   round2(totalMkt),
		TotalUnrealizedPnL: round2(totalMkt - totalBook),
		AssetAllocation:    alloc,
	}, rows.Err()
}

// ── Transactions list ─────────────────────────────────────────────────────────

func (s *Service) ListTransactions(ctx context.Context, fundID *uuid.UUID, txnType string, limit int) ([]Transaction, error) {
	if limit <= 0 {
		limit = 100
	}
	const q = `
		SELECT t.id, t.fund_id, f.name, t.instrument_id,
		       COALESCE(i.ticker,''), COALESCE(i.name,''),
		       t.txn_type, t.trade_date::text, t.settlement_date::text,
		       t.quantity::float8, t.price::float8,
		       t.gross_amount::float8, t.fees::float8, t.net_amount::float8,
		       t.realized_pnl::float8,
		       t.currency, t.reference, t.narration, t.status,
		       t.journal_id, t.created_by_name, t.created_at
		FROM   portfolio.transaction t
		JOIN   portfolio.fund        f ON f.id = t.fund_id
		LEFT   JOIN portfolio.instrument i ON i.id = t.instrument_id
		WHERE  ($1::uuid IS NULL OR t.fund_id = $1)
		  AND  ($2 = ''   OR t.txn_type = $2)
		ORDER  BY t.trade_date DESC, t.created_at DESC
		LIMIT  $3
	`
	rows, err := s.pool.Query(ctx, q, fundID, txnType, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactions(rows)
}

func (s *Service) getTransaction(ctx context.Context, id uuid.UUID) (Transaction, error) {
	const q = `
		SELECT t.id, t.fund_id, f.name, t.instrument_id,
		       COALESCE(i.ticker,''), COALESCE(i.name,''),
		       t.txn_type, t.trade_date::text, t.settlement_date::text,
		       t.quantity::float8, t.price::float8,
		       t.gross_amount::float8, t.fees::float8, t.net_amount::float8,
		       t.realized_pnl::float8,
		       t.currency, t.reference, t.narration, t.status,
		       t.journal_id, t.created_by_name, t.created_at
		FROM   portfolio.transaction t
		JOIN   portfolio.fund        f ON f.id = t.fund_id
		LEFT   JOIN portfolio.instrument i ON i.id = t.instrument_id
		WHERE  t.id = $1
	`
	rows, err := s.pool.Query(ctx, q, id)
	if err != nil {
		return Transaction{}, err
	}
	defer rows.Close()
	txns, err := scanTransactions(rows)
	if err != nil || len(txns) == 0 {
		return Transaction{}, fmt.Errorf("portfolio: transaction not found")
	}
	return txns[0], nil
}

// ── Scanners ──────────────────────────────────────────────────────────────────

func scanInstruments(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Instrument, error) {
	var out []Instrument
	for rows.Next() {
		var inst Instrument
		var matDate *string
		if err := rows.Scan(
			&inst.ID, &inst.Ticker, &inst.Name, &inst.AssetClass, &inst.Exchange, &inst.Currency,
			&inst.FaceValue, &inst.CouponRate, &matDate,
			&inst.Issuer, &inst.Sector, &inst.GLAccountCode, &inst.GainGLCode, &inst.LossGLCode,
			&inst.CostGLCode, &inst.IncomeGLCode, &inst.IsActive, &inst.CreatedAt,
		); err != nil {
			return nil, err
		}
		inst.MaturityDate = matDate
		out = append(out, inst)
	}
	return out, rows.Err()
}

func scanFunds(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Fund, error) {
	var out []Fund
	for rows.Next() {
		var f Fund
		if err := rows.Scan(
			&f.ID, &f.Code, &f.Name, &f.FundType, &f.Benchmark, &f.Currency,
			&f.InceptionDate, &f.TargetReturn, &f.Status, &f.ClientID,
			&f.SubsidiaryID, &f.AUM, &f.CreatedByName, &f.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// ── Client accounts ───────────────────────────────────────────────────────────

type ClientAccount struct {
	ID             uuid.UUID  `json:"id"`
	AccountNumber  string     `json:"account_number"`
	ClientID       uuid.UUID  `json:"client_id"`
	ClientName     string     `json:"client_name"`
	FundID         uuid.UUID  `json:"fund_id"`
	FundName       string     `json:"fund_name"`
	FundType       string     `json:"fund_type"`
	Currency       string     `json:"currency"`
	UnitsHeld      float64    `json:"units_held"`
	InvestedAmount float64    `json:"invested_amount"`
	CurrentValue   float64    `json:"current_value"`
	RealizedPnL    float64    `json:"realized_pnl"`
	UnrealizedPnL  float64    `json:"unrealized_pnl"`
	RMPersonID     *uuid.UUID `json:"rm_person_id,omitempty"`
	RMName         string     `json:"rm_name"`
	Status         string     `json:"status"`
	OpenedDate     string     `json:"opened_date"`
	ClosedDate     *string    `json:"closed_date,omitempty"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
}

type ClientTransaction struct {
	ID             uuid.UUID  `json:"id"`
	AccountID      uuid.UUID  `json:"account_id"`
	AccountNumber  string     `json:"account_number"`
	ClientName     string     `json:"client_name"`
	TxnType        string     `json:"txn_type"`
	TxnDate        string     `json:"txn_date"`
	Amount         float64    `json:"amount"`
	Units          float64    `json:"units"`
	NavPerUnit     float64    `json:"nav_per_unit"`
	Fees           float64    `json:"fees"`
	NetAmount      float64    `json:"net_amount"`
	RunningBalance float64    `json:"running_balance"`
	Reference      string     `json:"reference"`
	Narration      string     `json:"narration"`
	Status         string     `json:"status"`
	JournalID      *uuid.UUID `json:"journal_id,omitempty"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
}

type OpenAccountInput struct {
	ClientID    uuid.UUID  `json:"client_id"`
	ClientName  string     `json:"client_name"`
	ClientType  string     `json:"client_type"` // individual | corporate
	FundID      uuid.UUID  `json:"fund_id"`
	Currency    string     `json:"currency"`
	OpenedDate  string     `json:"opened_date"`
	RMPersonID  *uuid.UUID `json:"rm_person_id"`
	RMName      string     `json:"rm_name"`
	// Per-account overrides (inherits from fund defaults if not set)
	TenorDays  *int     `json:"tenor_days"`
	AgreedRate *float64 `json:"agreed_rate"`
}

type SubscriptionInput struct {
	AccountID  uuid.UUID `json:"account_id"`
	Amount     float64   `json:"amount"`
	Fees       float64   `json:"fees"`
	TxnDate    string    `json:"txn_date"`
	NavPerUnit float64   `json:"nav_per_unit"` // 0 = use 1.0 (initial / segregated)
	BankCode   string    `json:"bank_account_code"`
	Narration  string    `json:"narration"`
}

type RedemptionInput struct {
	AccountID  uuid.UUID `json:"account_id"`
	Amount     float64   `json:"amount"` // requested redemption amount (0 = full redemption)
	Units      float64   `json:"units"`  // alternatively specify units (0 = use amount)
	Fees       float64   `json:"fees"`
	TxnDate    string    `json:"txn_date"`
	NavPerUnit float64   `json:"nav_per_unit"`
	BankCode   string    `json:"bank_account_code"`
	Narration  string    `json:"narration"`
}

// OpenClientAccount creates an investment account linking a client to a fund.
func (s *Service) OpenClientAccount(ctx context.Context, in OpenAccountInput, byID uuid.UUID, byName string) (ClientAccount, error) {
	fund, err := s.getFund(ctx, in.FundID)
	if err != nil {
		return ClientAccount{}, fmt.Errorf("portfolio: fund not found: %w", err)
	}
	if in.Currency == "" {
		in.Currency = fund.Currency
	}
	if in.OpenedDate == "" {
		in.OpenedDate = time.Now().Format("2006-01-02")
	}

	// Generate account number: PAM/YYYY/NNNN
	var seq int
	year := time.Now().Year()
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)+1 FROM portfolio.client_account`).Scan(&seq)
	accNum := fmt.Sprintf("PAM/%d/%04d", year, seq)

	clientType := in.ClientType
	if clientType == "" {
		clientType = "corporate"
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.client_account
		    (account_number, client_id, client_name, fund_id, currency, client_type,
		     opened_date, tenor_days, agreed_rate,
		     rm_person_id, rm_name, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id
	`, accNum, in.ClientID, in.ClientName, in.FundID, in.Currency, clientType,
		in.OpenedDate, in.TenorDays, in.AgreedRate,
		in.RMPersonID, in.RMName, byID, byName,
	).Scan(&id); err != nil {
		return ClientAccount{}, fmt.Errorf("portfolio: open account: %w", err)
	}
	return s.getClientAccount(ctx, id)
}

// ProcessSubscription records client money coming into the fund.
// GL: Dr 1110 (bank) / Cr client liability or fund income depending on fund type.
// Subscription posts: Dr Bank / Cr 2110 (Client Funds Payable — LIABILITY).
// Account 1120 (Client Funds Segregated) is an ASSET used to track invested pools,
// not the liability owed to the client. Using 2110 correctly increases liabilities
// when client cash is received, balancing the bank asset increase.
func (s *Service) ProcessSubscription(ctx context.Context, in SubscriptionInput, byID uuid.UUID, byName string) (ClientTransaction, error) {
	if in.Amount <= 0 {
		return ClientTransaction{}, fmt.Errorf("portfolio: amount must be positive")
	}
	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	acc, err := s.getClientAccount(ctx, in.AccountID)
	if err != nil {
		return ClientTransaction{}, err
	}
	fund, err := s.getFund(ctx, acc.FundID)
	if err != nil {
		return ClientTransaction{}, err
	}

	navPerUnit := in.NavPerUnit
	if navPerUnit <= 0 {
		navPerUnit = 1.0 // default: 1 unit = 1 NGN for initial subscription
	}

	fees := round2(in.Fees)
	netAmount := round2(in.Amount - fees)
	units := round2(netAmount / navPerUnit)

	bankName, clientFundName := "Cash at Bank", "Client Funds Payable"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)
	// 2110 = Client Funds Payable (LIABILITY, CR normal) — correct contra for cash received from clients.
	// 1120 (Client Funds Segregated) is an ASSET and would reduce rather than increase obligations.
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = '2110'`).Scan(&clientFundName)

	narration := in.Narration
	if narration == "" {
		narration = fmt.Sprintf("Subscription – %s – %s", acc.ClientName, acc.AccountNumber)
	}

	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: fund.SubsidiaryID,
		Date:         in.TxnDate,
		Type:         "Subscription",
		Description:  narration,
		Lines: []finance.JournalLineInput{
			{AccountCode: in.BankCode, AccountName: bankName, Narration: narration, Debit: in.Amount},
			{AccountCode: "2110", AccountName: clientFundName, Narration: narration, Credit: netAmount},
		},
	})
	if err != nil {
		return ClientTransaction{}, fmt.Errorf("portfolio: create journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return ClientTransaction{}, fmt.Errorf("portfolio: post journal: %w", err)
	}

	// Update account position
	newInvested := round2(acc.InvestedAmount + netAmount)
	newUnits := round2(acc.UnitsHeld + units)
	newValue := round2(newUnits * navPerUnit)
	newUnrealized := round2(newValue - newInvested)

	// Compute maturity date if this is the first subscription (investment_date not yet set)
	// and the account/fund has a defined tenor.
	var maturityDateSQL *string
	if acc.InvestedAmount == 0 {
		// First subscription — lock in the investment_date
		var tenorDays *int
		_ = s.pool.QueryRow(ctx, `
			SELECT COALESCE(ca.tenor_days, f.tenor_days)
			FROM   portfolio.client_account ca
			JOIN   portfolio.fund f ON f.id = ca.fund_id
			WHERE  ca.id = $1
		`, in.AccountID).Scan(&tenorDays)

		if tenorDays != nil {
			invDate, _ := time.Parse("2006-01-02", in.TxnDate)
			mat := invDate.AddDate(0, 0, *tenorDays).Format("2006-01-02")
			maturityDateSQL = &mat
		}
	}

	maturityClause := "maturity_date"
	if maturityDateSQL != nil {
		maturityClause = "$6"
	}
	_ = maturityClause // used below

	if maturityDateSQL != nil {
		if _, err := s.pool.Exec(ctx, `
			UPDATE portfolio.client_account
			SET    units_held      = $2,
			       invested_amount = $3,
			       current_value   = $4,
			       unrealized_pnl  = $5,
			       investment_date = COALESCE(investment_date, $6::date),
			       maturity_date   = COALESCE(maturity_date,   $7::date),
			       updated_at      = now()
			WHERE  id = $1
		`, in.AccountID, newUnits, newInvested, newValue, newUnrealized, in.TxnDate, *maturityDateSQL); err != nil {
			return ClientTransaction{}, err
		}
	} else {
		if _, err := s.pool.Exec(ctx, `
			UPDATE portfolio.client_account
			SET    units_held      = $2,
			       invested_amount = $3,
			       current_value   = $4,
			       unrealized_pnl  = $5,
			       investment_date = COALESCE(investment_date, $6::date),
			       updated_at      = now()
			WHERE  id = $1
		`, in.AccountID, newUnits, newInvested, newValue, newUnrealized, in.TxnDate); err != nil {
			return ClientTransaction{}, err
		}
	}

	// Update fund AUM
	_, _ = s.pool.Exec(ctx, `UPDATE portfolio.fund SET aum = aum + $2 WHERE id = $1`, acc.FundID, netAmount)

	ref := fmt.Sprintf("SUB/%s/%s", acc.AccountNumber, in.TxnDate)
	var txID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.client_transaction
		    (account_id, txn_type, txn_date, amount, units, nav_per_unit, fees, net_amount,
		     running_balance, reference, narration, status, journal_id, created_by, created_by_name)
		VALUES ($1,'subscription',$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12,$13)
		RETURNING id
	`, in.AccountID, in.TxnDate, in.Amount, units, navPerUnit, fees, netAmount,
		newValue, ref, narration, journal.ID, byID, byName,
	).Scan(&txID); err != nil {
		return ClientTransaction{}, err
	}
	return s.getClientTransaction(ctx, txID)
}

// ProcessRedemption records client money leaving the fund.
func (s *Service) ProcessRedemption(ctx context.Context, in RedemptionInput, byID uuid.UUID, byName string) (ClientTransaction, error) {
	acc, err := s.getClientAccount(ctx, in.AccountID)
	if err != nil {
		return ClientTransaction{}, err
	}
	fund, err := s.getFund(ctx, acc.FundID)
	if err != nil {
		return ClientTransaction{}, err
	}

	navPerUnit := in.NavPerUnit
	if navPerUnit <= 0 {
		navPerUnit = 1.0
	}

	var units, grossAmount float64
	if in.Units > 0 {
		units = in.Units
		grossAmount = round2(units * navPerUnit)
	} else if in.Amount > 0 {
		grossAmount = in.Amount
		units = round2(grossAmount / navPerUnit)
	} else {
		// Full redemption
		units = acc.UnitsHeld
		grossAmount = round2(units * navPerUnit)
	}

	if units > acc.UnitsHeld+0.000001 {
		return ClientTransaction{}, fmt.Errorf("portfolio: redemption units (%.6f) exceed holding (%.6f)", units, acc.UnitsHeld)
	}

	fees := round2(in.Fees)
	netAmount := round2(grossAmount - fees)

	// Realized P&L = proceeds (net) - cost basis of redeemed units
	costBasisPerUnit := 0.0
	if acc.UnitsHeld > 0 {
		costBasisPerUnit = acc.InvestedAmount / acc.UnitsHeld
	}
	costBasis := round2(units * costBasisPerUnit)
	realizedPnL := round2(netAmount - costBasis)

	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	bankName, clientFundName := "Cash at Bank", "Client Funds Payable"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)
	// 2110 = Client Funds Payable (LIABILITY, DR to reduce) — mirrors the subscription credit.
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = '2110'`).Scan(&clientFundName)

	narration := in.Narration
	if narration == "" {
		narration = fmt.Sprintf("Redemption – %s – %s", acc.ClientName, acc.AccountNumber)
	}

	lines := []finance.JournalLineInput{
		{AccountCode: "2110", AccountName: clientFundName, Narration: narration, Debit: grossAmount},
		{AccountCode: in.BankCode, AccountName: bankName, Narration: narration, Credit: netAmount},
	}
	if fees > 0 {
		feeName := "Management Fees Income"
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM finance.account WHERE code = '4001'`).Scan(&feeName)
		lines = append(lines, finance.JournalLineInput{
			AccountCode: "4001", AccountName: feeName, Narration: "Redemption fees – " + acc.ClientName, Credit: fees,
		})
	}

	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: fund.SubsidiaryID,
		Date:         in.TxnDate,
		Type:         "Redemption",
		Description:  narration,
		Lines:        lines,
	})
	if err != nil {
		return ClientTransaction{}, fmt.Errorf("portfolio: create journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return ClientTransaction{}, fmt.Errorf("portfolio: post journal: %w", err)
	}

	// Update account
	newUnits := round2(acc.UnitsHeld - units)
	newInvested := round2(acc.InvestedAmount - costBasis)
	if newInvested < 0 {
		newInvested = 0
	}
	newValue := round2(newUnits * navPerUnit)
	newRealized := round2(acc.RealizedPnL + realizedPnL)
	newUnrealized := round2(newValue - newInvested)

	if _, err := s.pool.Exec(ctx, `
		UPDATE portfolio.client_account
		SET    units_held      = $2,
		       invested_amount = $3,
		       current_value   = $4,
		       realized_pnl    = $5,
		       unrealized_pnl  = $6,
		       status          = CASE WHEN $2 = 0 THEN 'closed' ELSE status END,
		       updated_at      = now()
		WHERE  id = $1
	`, in.AccountID, newUnits, newInvested, newValue, newRealized, newUnrealized); err != nil {
		return ClientTransaction{}, err
	}

	_, _ = s.pool.Exec(ctx, `UPDATE portfolio.fund SET aum = GREATEST(0, aum - $2) WHERE id = $1`, acc.FundID, netAmount)

	ref := fmt.Sprintf("RED/%s/%s", acc.AccountNumber, in.TxnDate)
	var txID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.client_transaction
		    (account_id, txn_type, txn_date, amount, units, nav_per_unit, fees, net_amount,
		     running_balance, reference, narration, status, journal_id, created_by, created_by_name)
		VALUES ($1,'redemption',$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12,$13)
		RETURNING id
	`, in.AccountID, in.TxnDate, grossAmount, units, navPerUnit, fees, netAmount,
		newValue, ref, narration, journal.ID, byID, byName,
	).Scan(&txID); err != nil {
		return ClientTransaction{}, err
	}
	return s.getClientTransaction(ctx, txID)
}

// ListClientAccounts returns accounts filtered by client or fund.
func (s *Service) ListClientAccounts(ctx context.Context, clientID *uuid.UUID, fundID *uuid.UUID) ([]ClientAccount, error) {
	const q = `
		SELECT ca.id, ca.account_number, ca.client_id, ca.client_name,
		       ca.fund_id, f.name, f.fund_type,
		       ca.currency, ca.units_held::float8, ca.invested_amount::float8,
		       ca.current_value::float8, ca.realized_pnl::float8, ca.unrealized_pnl::float8,
		       ca.rm_person_id, ca.rm_name, ca.status,
		       ca.opened_date::text, ca.closed_date::text,
		       ca.created_by_name, ca.created_at
		FROM   portfolio.client_account ca
		JOIN   portfolio.fund f ON f.id = ca.fund_id
		WHERE  ($1::uuid IS NULL OR ca.client_id = $1)
		  AND  ($2::uuid IS NULL OR ca.fund_id   = $2)
		ORDER  BY ca.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, clientID, fundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanClientAccounts(rows)
}

// GetClientStatement returns all transactions for an account in date range.
func (s *Service) GetClientStatement(ctx context.Context, accountID uuid.UUID, from, to string) ([]ClientTransaction, error) {
	const q = `
		SELECT ct.id, ct.account_id, ca.account_number, ca.client_name,
		       ct.txn_type, ct.txn_date::text, ct.amount::float8, ct.units::float8,
		       ct.nav_per_unit::float8, ct.fees::float8, ct.net_amount::float8,
		       ct.running_balance::float8, ct.reference, ct.narration, ct.status,
		       ct.journal_id, ct.created_by_name, ct.created_at
		FROM   portfolio.client_transaction ct
		JOIN   portfolio.client_account ca ON ca.id = ct.account_id
		WHERE  ct.account_id = $1
		  AND  ($2 = '' OR ct.txn_date::text >= $2)
		  AND  ($3 = '' OR ct.txn_date::text <= $3)
		ORDER  BY ct.txn_date DESC, ct.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, accountID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanClientTransactions(rows)
}

func (s *Service) getClientAccount(ctx context.Context, id uuid.UUID) (ClientAccount, error) {
	var ca ClientAccount
	var closedDate *string
	if err := s.pool.QueryRow(ctx, `
		SELECT ca.id, ca.account_number, ca.client_id, ca.client_name,
		       ca.fund_id, f.name, f.fund_type,
		       ca.currency, ca.units_held::float8, ca.invested_amount::float8,
		       ca.current_value::float8, ca.realized_pnl::float8, ca.unrealized_pnl::float8,
		       ca.rm_person_id, ca.rm_name, ca.status,
		       ca.opened_date::text, ca.closed_date::text,
		       ca.created_by_name, ca.created_at
		FROM   portfolio.client_account ca
		JOIN   portfolio.fund f ON f.id = ca.fund_id
		WHERE  ca.id = $1
	`, id).Scan(
		&ca.ID, &ca.AccountNumber, &ca.ClientID, &ca.ClientName,
		&ca.FundID, &ca.FundName, &ca.FundType,
		&ca.Currency, &ca.UnitsHeld, &ca.InvestedAmount,
		&ca.CurrentValue, &ca.RealizedPnL, &ca.UnrealizedPnL,
		&ca.RMPersonID, &ca.RMName, &ca.Status,
		&ca.OpenedDate, &closedDate,
		&ca.CreatedByName, &ca.CreatedAt,
	); err != nil {
		return ClientAccount{}, fmt.Errorf("portfolio: account not found: %w", err)
	}
	ca.ClosedDate = closedDate
	return ca, nil
}

func (s *Service) getClientTransaction(ctx context.Context, id uuid.UUID) (ClientTransaction, error) {
	var t ClientTransaction
	if err := s.pool.QueryRow(ctx, `
		SELECT ct.id, ct.account_id, ca.account_number, ca.client_name,
		       ct.txn_type, ct.txn_date::text, ct.amount::float8, ct.units::float8,
		       ct.nav_per_unit::float8, ct.fees::float8, ct.net_amount::float8,
		       ct.running_balance::float8, ct.reference, ct.narration, ct.status,
		       ct.journal_id, ct.created_by_name, ct.created_at
		FROM   portfolio.client_transaction ct
		JOIN   portfolio.client_account ca ON ca.id = ct.account_id
		WHERE  ct.id = $1
	`, id).Scan(
		&t.ID, &t.AccountID, &t.AccountNumber, &t.ClientName,
		&t.TxnType, &t.TxnDate, &t.Amount, &t.Units,
		&t.NavPerUnit, &t.Fees, &t.NetAmount,
		&t.RunningBalance, &t.Reference, &t.Narration, &t.Status,
		&t.JournalID, &t.CreatedByName, &t.CreatedAt,
	); err != nil {
		return ClientTransaction{}, err
	}
	return t, nil
}

func scanClientAccounts(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]ClientAccount, error) {
	var out []ClientAccount
	for rows.Next() {
		var ca ClientAccount
		var closedDate *string
		if err := rows.Scan(
			&ca.ID, &ca.AccountNumber, &ca.ClientID, &ca.ClientName,
			&ca.FundID, &ca.FundName, &ca.FundType,
			&ca.Currency, &ca.UnitsHeld, &ca.InvestedAmount,
			&ca.CurrentValue, &ca.RealizedPnL, &ca.UnrealizedPnL,
			&ca.RMPersonID, &ca.RMName, &ca.Status,
			&ca.OpenedDate, &closedDate,
			&ca.CreatedByName, &ca.CreatedAt,
		); err != nil {
			return nil, err
		}
		ca.ClosedDate = closedDate
		out = append(out, ca)
	}
	return out, rows.Err()
}

func scanClientTransactions(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]ClientTransaction, error) {
	var out []ClientTransaction
	for rows.Next() {
		var t ClientTransaction
		if err := rows.Scan(
			&t.ID, &t.AccountID, &t.AccountNumber, &t.ClientName,
			&t.TxnType, &t.TxnDate, &t.Amount, &t.Units,
			&t.NavPerUnit, &t.Fees, &t.NetAmount,
			&t.RunningBalance, &t.Reference, &t.Narration, &t.Status,
			&t.JournalID, &t.CreatedByName, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func scanTransactions(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Transaction, error) {
	var out []Transaction
	for rows.Next() {
		var t Transaction
		var settleDate *string
		if err := rows.Scan(
			&t.ID, &t.FundID, &t.FundName, &t.InstrumentID,
			&t.Ticker, &t.InstrumentName,
			&t.TxnType, &t.TradeDate, &settleDate,
			&t.Quantity, &t.Price,
			&t.GrossAmount, &t.Fees, &t.NetAmount, &t.RealizedPnL,
			&t.Currency, &t.Reference, &t.Narration, &t.Status,
			&t.JournalID, &t.CreatedByName, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		t.SettlementDate = settleDate
		out = append(out, t)
	}
	return out, rows.Err()
}
