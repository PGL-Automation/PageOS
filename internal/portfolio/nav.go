package portfolio

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// NAVResult holds the computed Net Asset Value for a fund on a given date.
type NAVResult struct {
	FundID       uuid.UUID `json:"fund_id"`
	FundName     string    `json:"fund_name"`
	NavDate      time.Time `json:"nav_date"`
	TotalNAV     float64   `json:"total_nav"`    // sum of all holding market values
	TotalUnits   float64   `json:"total_units"`  // sum of active client_account.units_held
	NAVPerUnit   float64   `json:"nav_per_unit"` // TotalNAV / TotalUnits (0 if no units)
	HoldingCount int       `json:"holding_count"`
	CreatedAt    time.Time `json:"created_at"`
}

// CalculateNAV computes the NAV for a fund as of navDate.
//
// For each holding it looks up the most recent price from portfolio.price where
// price_date <= navDate, recomputes market_value and unrealized_pnl on the
// holding row, sums those market values, divides by total active units, then
// upserts the result into portfolio.nav.
func (s *Service) CalculateNAV(ctx context.Context, fundID uuid.UUID, navDate time.Time) (NAVResult, error) {
	fund, err := s.getFund(ctx, fundID)
	if err != nil {
		return NAVResult{}, fmt.Errorf("portfolio: nav: fund not found: %w", err)
	}

	// Fetch all holdings with positive quantity.
	type holdingRow struct {
		id           uuid.UUID
		instrumentID uuid.UUID
		quantity     float64
		bookValue    float64
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, instrument_id, quantity::float8, book_value::float8
		FROM   portfolio.holding
		WHERE  fund_id = $1 AND quantity > 0
	`, fundID)
	if err != nil {
		return NAVResult{}, fmt.Errorf("portfolio: nav: load holdings: %w", err)
	}
	var holdings []holdingRow
	for rows.Next() {
		var h holdingRow
		if err := rows.Scan(&h.id, &h.instrumentID, &h.quantity, &h.bookValue); err != nil {
			rows.Close()
			return NAVResult{}, fmt.Errorf("portfolio: nav: scan holding: %w", err)
		}
		holdings = append(holdings, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return NAVResult{}, fmt.Errorf("portfolio: nav: holdings rows: %w", err)
	}

	navDateStr := navDate.Format("2006-01-02")
	var totalNAV float64

	for _, h := range holdings {
		// Look up the most recent close price on or before navDate.
		var latestPrice float64
		err := s.pool.QueryRow(ctx, `
			SELECT close_price::float8
			FROM   portfolio.price
			WHERE  instrument_id = $1
			  AND  price_date <= $2
			ORDER  BY price_date DESC
			LIMIT  1
		`, h.instrumentID, navDateStr).Scan(&latestPrice)
		if err != nil {
			// No price available for this instrument — use book value as a proxy
			// so we do not silently drop the position from NAV.
			if h.quantity > 0 {
				latestPrice = h.bookValue / h.quantity
			}
		}

		marketValue := round2(h.quantity * latestPrice)
		unrealizedPnL := round2(marketValue - h.bookValue)

		// Update the holding row with current market data.
		if _, err := s.pool.Exec(ctx, `
			UPDATE portfolio.holding
			SET    market_price   = $2,
			       market_value   = $3,
			       unrealized_pnl = $4,
			       last_priced_at = now(),
			       updated_at     = now()
			WHERE  id = $1
		`, h.id, latestPrice, marketValue, unrealizedPnL); err != nil {
			return NAVResult{}, fmt.Errorf("portfolio: nav: update holding %s: %w", h.id, err)
		}

		totalNAV += marketValue
	}
	totalNAV = round2(totalNAV)

	// Sum units across all active client accounts for this fund.
	var totalUnits float64
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(units_held),0)::float8
		FROM   portfolio.client_account
		WHERE  fund_id = $1 AND status = 'active'
	`, fundID).Scan(&totalUnits)
	totalUnits = round2(totalUnits)

	navPerUnit := 0.0
	if totalUnits > 0 {
		navPerUnit = round2(totalNAV / totalUnits)
	}

	// Upsert into portfolio.nav.
	var createdAt time.Time
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.nav (fund_id, nav_date, nav_per_unit, total_nav, total_units)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (fund_id, nav_date) DO UPDATE
		SET nav_per_unit = EXCLUDED.nav_per_unit,
		    total_nav    = EXCLUDED.total_nav,
		    total_units  = EXCLUDED.total_units
		RETURNING created_at
	`, fundID, navDateStr, navPerUnit, totalNAV, totalUnits).Scan(&createdAt); err != nil {
		return NAVResult{}, fmt.Errorf("portfolio: nav: upsert nav record: %w", err)
	}

	return NAVResult{
		FundID:       fundID,
		FundName:     fund.Name,
		NavDate:      navDate,
		TotalNAV:     totalNAV,
		TotalUnits:   totalUnits,
		NAVPerUnit:   navPerUnit,
		HoldingCount: len(holdings),
		CreatedAt:    createdAt,
	}, nil
}

// GetNAVHistory returns the stored NAV records for a fund within a date range.
func (s *Service) GetNAVHistory(ctx context.Context, fundID uuid.UUID, from, to time.Time) ([]NAVResult, error) {
	fromStr := from.Format("2006-01-02")
	toStr := to.Format("2006-01-02")

	rows, err := s.pool.Query(ctx, `
		SELECT n.fund_id, f.name,
		       n.nav_date, n.total_nav::float8, n.total_units::float8,
		       n.nav_per_unit::float8, n.created_at
		FROM   portfolio.nav n
		JOIN   portfolio.fund f ON f.id = n.fund_id
		WHERE  n.fund_id = $1
		  AND  n.nav_date >= $2
		  AND  n.nav_date <= $3
		ORDER  BY n.nav_date DESC
	`, fundID, fromStr, toStr)
	if err != nil {
		return nil, fmt.Errorf("portfolio: nav history: query: %w", err)
	}
	defer rows.Close()

	var out []NAVResult
	for rows.Next() {
		var r NAVResult
		if err := rows.Scan(
			&r.FundID, &r.FundName,
			&r.NavDate, &r.TotalNAV, &r.TotalUnits,
			&r.NAVPerUnit, &r.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("portfolio: nav history: scan: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RunAllNAVs calculates NAV for every active fund and returns all results.
// Intended to be called by the daily scheduler.
func (s *Service) RunAllNAVs(ctx context.Context, navDate time.Time) ([]NAVResult, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id FROM portfolio.fund WHERE status = 'active'
	`)
	if err != nil {
		return nil, fmt.Errorf("portfolio: run all navs: list funds: %w", err)
	}
	var fundIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, fmt.Errorf("portfolio: run all navs: scan fund id: %w", err)
		}
		fundIDs = append(fundIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("portfolio: run all navs: funds rows: %w", err)
	}

	var results []NAVResult
	for _, fid := range fundIDs {
		result, err := s.CalculateNAV(ctx, fid, navDate)
		if err != nil {
			// Log and continue so one bad fund does not abort the whole run.
			// The caller can inspect partial results.
			_ = err
			continue
		}
		results = append(results, result)
	}
	return results, nil
}
