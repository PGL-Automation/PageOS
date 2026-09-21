package portfolio

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
)

// ── Performance types ─────────────────────────────────────────────────────────

type PerformanceMetrics struct {
	FundID             uuid.UUID `json:"fund_id"`
	FundName           string    `json:"fund_name"`
	CalcDate           time.Time `json:"calc_date"`
	Period             string    `json:"period"` // "1m","3m","6m","1y","ytd","inception"
	TWRPct             float64   `json:"twr_pct"`
	MWRPct             float64   `json:"mwr_pct"`
	VolatilityPct      float64   `json:"volatility_pct"`
	SharpeRatio        float64   `json:"sharpe_ratio"`
	BenchmarkReturnPct float64   `json:"benchmark_return_pct"`
	ExcessReturnPct    float64   `json:"excess_return_pct"`
	CreatedAt          time.Time `json:"created_at"`
}

type ClientPerformance struct {
	AccountID      uuid.UUID `json:"account_id"`
	AccountNumber  string    `json:"account_number"`
	ClientName     string    `json:"client_name"`
	InvestedAmount float64   `json:"invested_amount"`
	CurrentValue   float64   `json:"current_value"`
	AbsoluteReturn float64   `json:"absolute_return"`
	ReturnPct      float64   `json:"return_pct"`
	MWRPct         float64   `json:"mwr_pct"`
	OpenedDate     time.Time `json:"opened_date"`
	DaysHeld       int       `json:"days_held"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// round6 rounds to 6 decimal places for return percentages.
func round6(f float64) float64 {
	return math.Round(f*1_000_000) / 1_000_000
}

func mean(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	var sum float64
	for _, x := range xs {
		sum += x
	}
	return sum / float64(len(xs))
}

func stddev(xs []float64) float64 {
	if len(xs) < 2 {
		return 0
	}
	m := mean(xs)
	var variance float64
	for _, x := range xs {
		d := x - m
		variance += d * d
	}
	variance /= float64(len(xs) - 1) // sample stddev
	return math.Sqrt(variance)
}

// periodStartDate resolves the start date for a named period.
// inceptionDate should be in "2006-01-02" format.
func periodStartDate(period string, now time.Time, inceptionDate string) (time.Time, error) {
	switch period {
	case "1m":
		return now.AddDate(0, 0, -30), nil
	case "3m":
		return now.AddDate(0, 0, -90), nil
	case "6m":
		return now.AddDate(0, 0, -180), nil
	case "1y":
		return now.AddDate(0, 0, -365), nil
	case "ytd":
		return time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location()), nil
	case "inception":
		t, err := time.Parse("2006-01-02", inceptionDate)
		if err != nil {
			return time.Time{}, fmt.Errorf("portfolio: performance: invalid inception_date %q: %w", inceptionDate, err)
		}
		return t, nil
	default:
		return time.Time{}, fmt.Errorf("portfolio: performance: unknown period %q", period)
	}
}

// ── NAV row for internal use ──────────────────────────────────────────────────

type navRow struct {
	navDate    time.Time
	navPerUnit float64
	totalNAV   float64
}

func (s *Service) loadNAVSeries(ctx context.Context, fundID uuid.UUID, startDate, endDate time.Time) ([]navRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT nav_date, nav_per_unit::float8, total_nav::float8
		FROM   portfolio.nav
		WHERE  fund_id  = $1
		  AND  nav_date >= $2
		  AND  nav_date <= $3
		ORDER  BY nav_date ASC
	`, fundID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("portfolio: performance: load nav series: %w", err)
	}
	defer rows.Close()

	var out []navRow
	for rows.Next() {
		var r navRow
		if err := rows.Scan(&r.navDate, &r.navPerUnit, &r.totalNAV); err != nil {
			return nil, fmt.Errorf("portfolio: performance: scan nav row: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ── Benchmark return ──────────────────────────────────────────────────────────

// benchmarkReturn fetches start and end prices for the benchmark instrument
// and returns the return percentage. Returns 0 with no error when unavailable.
func (s *Service) benchmarkReturn(ctx context.Context, ticker string, startDate, endDate time.Time) float64 {
	if ticker == "" {
		return 0
	}

	// Resolve instrument ID by ticker.
	var instrID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		SELECT id FROM portfolio.instrument WHERE ticker = $1 LIMIT 1
	`, ticker).Scan(&instrID); err != nil {
		return 0
	}

	// Get the closest price on or before startDate.
	var startPrice float64
	if err := s.pool.QueryRow(ctx, `
		SELECT close_price::float8
		FROM   portfolio.price
		WHERE  instrument_id = $1 AND price_date <= $2
		ORDER  BY price_date DESC
		LIMIT  1
	`, instrID, startDate.Format("2006-01-02")).Scan(&startPrice); err != nil || startPrice == 0 {
		return 0
	}

	// Get the closest price on or before endDate.
	var endPrice float64
	if err := s.pool.QueryRow(ctx, `
		SELECT close_price::float8
		FROM   portfolio.price
		WHERE  instrument_id = $1 AND price_date <= $2
		ORDER  BY price_date DESC
		LIMIT  1
	`, instrID, endDate.Format("2006-01-02")).Scan(&endPrice); err != nil || endPrice == 0 {
		return 0
	}

	return round6((endPrice - startPrice) / startPrice * 100)
}

// ── Modified Dietz (fund-level) ───────────────────────────────────────────────

type flowRecord struct {
	date      time.Time
	netAmount float64 // positive = inflow, negative = outflow
}

// modifiedDietz computes the MWR using the Modified Dietz method.
// beginningValue and endingValue are total NAV at start and end.
func modifiedDietz(beginningValue, endingValue float64, flows []flowRecord, startDate, endDate time.Time) float64 {
	totalDays := endDate.Sub(startDate).Hours() / 24
	if totalDays <= 0 {
		return 0
	}

	var netFlows, weightedFlows float64
	for _, f := range flows {
		netFlows += f.netAmount
		daysRemaining := endDate.Sub(f.date).Hours() / 24
		weight := daysRemaining / totalDays
		weightedFlows += f.netAmount * weight
	}

	denominator := beginningValue + weightedFlows
	if denominator == 0 {
		return 0
	}
	return round6((endingValue - beginningValue - netFlows) / denominator * 100)
}

// loadFundFlows loads subscription and redemption net_amounts for a fund
// in the given period by joining client_transaction → client_account.
func (s *Service) loadFundFlows(ctx context.Context, fundID uuid.UUID, startDate, endDate time.Time) ([]flowRecord, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT ct.txn_date, ct.txn_type, ct.net_amount::float8
		FROM   portfolio.client_transaction ct
		JOIN   portfolio.client_account ca ON ca.id = ct.account_id
		WHERE  ca.fund_id  = $1
		  AND  ct.txn_type IN ('subscription','redemption')
		  AND  ct.txn_date >= $2
		  AND  ct.txn_date <= $3
		ORDER  BY ct.txn_date ASC
	`, fundID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("portfolio: performance: load fund flows: %w", err)
	}
	defer rows.Close()

	var flows []flowRecord
	for rows.Next() {
		var txnDate time.Time
		var txnType string
		var netAmount float64
		if err := rows.Scan(&txnDate, &txnType, &netAmount); err != nil {
			return nil, fmt.Errorf("portfolio: performance: scan flow: %w", err)
		}
		// Subscriptions are inflows (+), redemptions are outflows (-).
		if txnType == "redemption" {
			netAmount = -netAmount
		}
		flows = append(flows, flowRecord{date: txnDate, netAmount: netAmount})
	}
	return flows, rows.Err()
}

// loadAccountFlows loads subscription / redemption flows for a single account.
func (s *Service) loadAccountFlows(ctx context.Context, accountID uuid.UUID, startDate, endDate time.Time) ([]flowRecord, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT txn_date, txn_type, net_amount::float8
		FROM   portfolio.client_transaction
		WHERE  account_id = $1
		  AND  txn_type   IN ('subscription','redemption')
		  AND  txn_date   >= $2
		  AND  txn_date   <= $3
		ORDER  BY txn_date ASC
	`, accountID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("portfolio: performance: load account flows: %w", err)
	}
	defer rows.Close()

	var flows []flowRecord
	for rows.Next() {
		var txnDate time.Time
		var txnType string
		var netAmount float64
		if err := rows.Scan(&txnDate, &txnType, &netAmount); err != nil {
			return nil, fmt.Errorf("portfolio: performance: scan account flow: %w", err)
		}
		if txnType == "redemption" {
			netAmount = -netAmount
		}
		flows = append(flows, flowRecord{date: txnDate, netAmount: netAmount})
	}
	return flows, rows.Err()
}

// ── CalculatePerformance ──────────────────────────────────────────────────────

// CalculatePerformance computes TWR, MWR, volatility, Sharpe, and benchmark
// return for a fund over the named period, persists the result, and returns it.
func (s *Service) CalculatePerformance(ctx context.Context, fundID uuid.UUID, period string) (PerformanceMetrics, error) {
	fund, err := s.getFund(ctx, fundID)
	if err != nil {
		return PerformanceMetrics{}, fmt.Errorf("portfolio: performance: %w", err)
	}

	now := time.Now().UTC().Truncate(24 * time.Hour)
	startDate, err := periodStartDate(period, now, fund.InceptionDate)
	if err != nil {
		return PerformanceMetrics{}, err
	}
	endDate := now

	// Load NAV series.
	navSeries, err := s.loadNAVSeries(ctx, fundID, startDate, endDate)
	if err != nil {
		return PerformanceMetrics{}, err
	}
	if len(navSeries) < 2 {
		return PerformanceMetrics{}, fmt.Errorf("portfolio: performance: insufficient NAV history")
	}

	// Daily returns from nav_per_unit.
	dailyReturns := make([]float64, 0, len(navSeries)-1)
	twr := 1.0
	for i := 1; i < len(navSeries); i++ {
		prev := navSeries[i-1].navPerUnit
		curr := navSeries[i].navPerUnit
		if prev == 0 {
			continue
		}
		dr := (curr - prev) / prev
		dailyReturns = append(dailyReturns, dr)
		twr *= (1 + dr)
	}
	twrPct := round6((twr - 1) * 100)

	// Volatility (annualised).
	sd := stddev(dailyReturns)
	volPct := round6(sd * math.Sqrt(252) * 100)

	// Sharpe ratio (18% annual risk-free rate for Nigerian market).
	const rfrAnnual = 0.18
	rfrDaily := rfrAnnual / 252
	sharpe := 0.0
	if sd != 0 {
		meanDR := mean(dailyReturns)
		sharpe = round6((meanDR - rfrDaily) / sd * math.Sqrt(252))
	}

	// Benchmark return.
	bmReturn := s.benchmarkReturn(ctx, fund.Benchmark, startDate, endDate)

	// Excess return.
	excessReturn := round6(twrPct - bmReturn)

	// MWR via Modified Dietz.
	beginNAV := navSeries[0].totalNAV
	endNAV := navSeries[len(navSeries)-1].totalNAV

	flows, err := s.loadFundFlows(ctx, fundID, startDate, endDate)
	if err != nil {
		return PerformanceMetrics{}, err
	}
	mwrPct := modifiedDietz(beginNAV, endNAV, flows, startDate, endDate)

	// Upsert into portfolio.fund_performance.
	var createdAt time.Time
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.fund_performance
		    (fund_id, calc_date, period,
		     twr_pct, mwr_pct, volatility_pct, sharpe_ratio,
		     benchmark_return_pct, excess_return_pct)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (fund_id, calc_date, period) DO UPDATE
		SET twr_pct             = EXCLUDED.twr_pct,
		    mwr_pct             = EXCLUDED.mwr_pct,
		    volatility_pct      = EXCLUDED.volatility_pct,
		    sharpe_ratio        = EXCLUDED.sharpe_ratio,
		    benchmark_return_pct= EXCLUDED.benchmark_return_pct,
		    excess_return_pct   = EXCLUDED.excess_return_pct,
		    updated_at          = now()
		RETURNING created_at
	`, fundID, endDate.Format("2006-01-02"), period,
		twrPct, mwrPct, volPct, sharpe, bmReturn, excessReturn,
	).Scan(&createdAt); err != nil {
		return PerformanceMetrics{}, fmt.Errorf("portfolio: performance: upsert: %w", err)
	}

	return PerformanceMetrics{
		FundID:             fundID,
		FundName:           fund.Name,
		CalcDate:           endDate,
		Period:             period,
		TWRPct:             twrPct,
		MWRPct:             mwrPct,
		VolatilityPct:      volPct,
		SharpeRatio:        sharpe,
		BenchmarkReturnPct: bmReturn,
		ExcessReturnPct:    excessReturn,
		CreatedAt:          createdAt,
	}, nil
}

// ── GetPerformanceHistory ─────────────────────────────────────────────────────

// GetPerformanceHistory returns all stored performance records for a fund,
// ordered by calc_date DESC.
func (s *Service) GetPerformanceHistory(ctx context.Context, fundID uuid.UUID) ([]PerformanceMetrics, error) {
	fund, err := s.getFund(ctx, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: performance history: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT fund_id, calc_date, period,
		       twr_pct::float8, mwr_pct::float8, volatility_pct::float8,
		       sharpe_ratio::float8, benchmark_return_pct::float8,
		       excess_return_pct::float8, created_at
		FROM   portfolio.fund_performance
		WHERE  fund_id = $1
		ORDER  BY calc_date DESC
	`, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: performance history: query: %w", err)
	}
	defer rows.Close()

	var out []PerformanceMetrics
	for rows.Next() {
		var m PerformanceMetrics
		var calcDate time.Time
		if err := rows.Scan(
			&m.FundID, &calcDate, &m.Period,
			&m.TWRPct, &m.MWRPct, &m.VolatilityPct,
			&m.SharpeRatio, &m.BenchmarkReturnPct,
			&m.ExcessReturnPct, &m.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("portfolio: performance history: scan: %w", err)
		}
		m.FundName = fund.Name
		m.CalcDate = calcDate
		out = append(out, m)
	}
	return out, rows.Err()
}

// ── GetClientPerformance ──────────────────────────────────────────────────────

// GetClientPerformance returns performance metrics for each active client
// account in a fund, sorted by return_pct DESC.
func (s *Service) GetClientPerformance(ctx context.Context, fundID uuid.UUID) ([]ClientPerformance, error) {
	// Load all active accounts for the fund.
	rows, err := s.pool.Query(ctx, `
		SELECT ca.id, ca.account_number, ca.client_name,
		       ca.invested_amount::float8, ca.current_value::float8,
		       ca.opened_date
		FROM   portfolio.client_account ca
		WHERE  ca.fund_id = $1 AND ca.status = 'active'
		ORDER  BY ca.opened_date ASC
	`, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: client performance: query: %w", err)
	}
	defer rows.Close()

	type accountRow struct {
		id             uuid.UUID
		accountNumber  string
		clientName     string
		investedAmount float64
		currentValue   float64
		openedDate     time.Time
	}

	var accounts []accountRow
	for rows.Next() {
		var a accountRow
		if err := rows.Scan(
			&a.id, &a.accountNumber, &a.clientName,
			&a.investedAmount, &a.currentValue,
			&a.openedDate,
		); err != nil {
			return nil, fmt.Errorf("portfolio: client performance: scan: %w", err)
		}
		accounts = append(accounts, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("portfolio: client performance: rows: %w", err)
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	var out []ClientPerformance

	for _, a := range accounts {
		absReturn := round6(a.currentValue - a.investedAmount)
		var returnPct float64
		if a.investedAmount != 0 {
			returnPct = round6(absReturn / a.investedAmount * 100)
		}
		daysHeld := int(today.Sub(a.openedDate).Hours() / 24)

		// Account-level Modified Dietz MWR.
		// beginningValue = investedAmount (cost basis as surrogate for start NAV)
		// endingValue    = currentValue
		// flows          = all subscriptions/redemptions since account opened
		flows, err := s.loadAccountFlows(ctx, a.id, a.openedDate, today)
		if err != nil {
			return nil, err
		}
		mwrPct := modifiedDietz(a.investedAmount, a.currentValue, flows, a.openedDate, today)

		out = append(out, ClientPerformance{
			AccountID:      a.id,
			AccountNumber:  a.accountNumber,
			ClientName:     a.clientName,
			InvestedAmount: round6(a.investedAmount),
			CurrentValue:   round6(a.currentValue),
			AbsoluteReturn: absReturn,
			ReturnPct:      returnPct,
			MWRPct:         mwrPct,
			OpenedDate:     a.openedDate,
			DaysHeld:       daysHeld,
		})
	}

	// Sort by return_pct DESC.
	sort.Slice(out, func(i, j int) bool {
		return out[i].ReturnPct > out[j].ReturnPct
	})

	return out, nil
}
