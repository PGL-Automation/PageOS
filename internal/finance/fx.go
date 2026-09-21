package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── FX Rate types ─────────────────────────────────────────────────────────────

type FXRate struct {
	FromCurrency string    `json:"from_currency"`
	ToCurrency   string    `json:"to_currency"`
	RateDate     time.Time `json:"rate_date"`
	Rate         float64   `json:"rate"` // how many ToCurrency per 1 FromCurrency
	Source       string    `json:"source"`
	CreatedAt    time.Time `json:"created_at"`
}

type SetFXRateInput struct {
	FromCurrency string    `json:"from_currency"`
	ToCurrency   string    `json:"to_currency"`
	RateDate     time.Time `json:"rate_date"`
	Rate         float64   `json:"rate"`
	Source       string    `json:"source"`
}

// ── SetFXRate ─────────────────────────────────────────────────────────────────

// SetFXRate upserts a rate into finance.fx_rate. Currency codes are
// normalised to upper-case before storage.
func (s *Service) SetFXRate(ctx context.Context, in SetFXRateInput, byID uuid.UUID) (FXRate, error) {
	if in.FromCurrency == "" || in.ToCurrency == "" {
		return FXRate{}, fmt.Errorf("finance: from_currency and to_currency are required")
	}
	if in.Rate <= 0 {
		return FXRate{}, fmt.Errorf("finance: rate must be positive")
	}
	if in.RateDate.IsZero() {
		return FXRate{}, fmt.Errorf("finance: rate_date is required")
	}

	from := strings.ToUpper(in.FromCurrency)
	to := strings.ToUpper(in.ToCurrency)

	if from == to {
		return FXRate{}, fmt.Errorf("finance: from_currency and to_currency must differ")
	}

	var r FXRate
	err := s.pool.QueryRow(ctx, `
		INSERT INTO finance.fx_rate
		    (from_currency, to_currency, rate_date, rate, source, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (from_currency, to_currency, rate_date)
		DO UPDATE SET
		    rate       = EXCLUDED.rate,
		    source     = EXCLUDED.source,
		    created_by = EXCLUDED.created_by,
		    created_at = now()
		RETURNING from_currency, to_currency, rate_date, rate::float8, source, created_at
	`, from, to, in.RateDate, in.Rate, in.Source, byID,
	).Scan(&r.FromCurrency, &r.ToCurrency, &r.RateDate, &r.Rate, &r.Source, &r.CreatedAt)
	if err != nil {
		return FXRate{}, fmt.Errorf("finance: set fx rate: %w", err)
	}
	return r, nil
}

// ── GetFXRate ─────────────────────────────────────────────────────────────────

// GetFXRate returns the exchange rate for the given currency pair on onDate.
// If no exact match exists, it falls back to the most recent rate before
// onDate. Returns an error if no rate is found at all.
func (s *Service) GetFXRate(ctx context.Context, fromCurrency, toCurrency string, onDate time.Time) (float64, error) {
	from := strings.ToUpper(fromCurrency)
	to := strings.ToUpper(toCurrency)

	if from == to {
		return 1.0, nil
	}

	var rate float64
	err := s.pool.QueryRow(ctx, `
		SELECT rate::float8
		FROM   finance.fx_rate
		WHERE  from_currency = $1
		  AND  to_currency   = $2
		  AND  rate_date    <= $3
		ORDER  BY rate_date DESC
		LIMIT  1
	`, from, to, onDate).Scan(&rate)
	if err != nil {
		return 0, fmt.Errorf("finance: no fx rate found for %s→%s on or before %s",
			from, to, onDate.Format("2006-01-02"))
	}
	return rate, nil
}

// ── ListFXRates ───────────────────────────────────────────────────────────────

// ListFXRates returns the rate history for a currency pair within [from, to].
// Either or both date bounds may be zero to indicate an open bound.
// fromCurrency / toCurrency may be empty to return all pairs.
func (s *Service) ListFXRates(ctx context.Context, fromCurrency, toCurrency string, from, to time.Time) ([]FXRate, error) {
	fromUpper := strings.ToUpper(fromCurrency)
	toUpper := strings.ToUpper(toCurrency)

	const q = `
		SELECT from_currency, to_currency, rate_date, rate::float8, source, created_at
		FROM   finance.fx_rate
		WHERE  ($1 = '' OR from_currency = $1)
		  AND  ($2 = '' OR to_currency   = $2)
		  AND  ($3::timestamptz IS NULL OR rate_date >= $3)
		  AND  ($4::timestamptz IS NULL OR rate_date <= $4)
		ORDER  BY from_currency, to_currency, rate_date DESC
	`

	var fromArg, toArg interface{}
	if from.IsZero() {
		fromArg = nil
	} else {
		fromArg = from
	}
	if to.IsZero() {
		toArg = nil
	} else {
		toArg = to
	}

	rows, err := s.pool.Query(ctx, q, fromUpper, toUpper, fromArg, toArg)
	if err != nil {
		return nil, fmt.Errorf("finance: list fx rates: %w", err)
	}
	defer rows.Close()

	var out []FXRate
	for rows.Next() {
		var r FXRate
		if err := rows.Scan(&r.FromCurrency, &r.ToCurrency, &r.RateDate,
			&r.Rate, &r.Source, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("finance: scan fx rate: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ── ConvertAmount ─────────────────────────────────────────────────────────────

// ConvertAmount converts amount from fromCurrency to toCurrency using the
// most appropriate rate on onDate. Returns amount unchanged when the two
// currencies are identical.
func (s *Service) ConvertAmount(ctx context.Context, amount float64, fromCurrency, toCurrency string, onDate time.Time) (float64, error) {
	from := strings.ToUpper(fromCurrency)
	to := strings.ToUpper(toCurrency)

	if from == to {
		return amount, nil
	}

	rate, err := s.GetFXRate(ctx, from, to, onDate)
	if err != nil {
		return 0, fmt.Errorf("finance: convert amount: %w", err)
	}
	return amount * rate, nil
}
