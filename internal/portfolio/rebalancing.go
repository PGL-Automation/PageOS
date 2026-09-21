package portfolio

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type TargetAllocation struct {
	ID             uuid.UUID  `json:"id"`
	FundID         uuid.UUID  `json:"fund_id"`
	AllocationType string     `json:"allocation_type"` // asset_class, instrument, sector, issuer
	InstrumentID   *uuid.UUID `json:"instrument_id,omitempty"`
	InstrumentName string     `json:"instrument_name,omitempty"`
	Ticker         string     `json:"ticker,omitempty"`
	Label          string     `json:"label"`
	TargetPct      float64    `json:"target_pct"`
	MinPct         float64    `json:"min_pct"`
	MaxPct         float64    `json:"max_pct"`
	IsActive       bool       `json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
}

type SetTargetAllocationInput struct {
	FundID         uuid.UUID  `json:"fund_id"`
	AllocationType string     `json:"allocation_type"`
	InstrumentID   *uuid.UUID `json:"instrument_id,omitempty"`
	Label          string     `json:"label"`
	TargetPct      float64    `json:"target_pct"`
	MinPct         float64    `json:"min_pct"`
	MaxPct         float64    `json:"max_pct"`
}

type DriftItem struct {
	Label          string     `json:"label"`
	AllocationType string     `json:"allocation_type"`
	InstrumentID   *uuid.UUID `json:"instrument_id,omitempty"`
	Ticker         string     `json:"ticker,omitempty"`
	CurrentPct     float64    `json:"current_pct"`
	TargetPct      float64    `json:"target_pct"`
	DriftPct       float64    `json:"drift_pct"`   // current - target (positive = overweight)
	CurrentValue   float64    `json:"current_value"`
	TargetValue    float64    `json:"target_value"`
	DriftValue     float64    `json:"drift_value"` // positive = overweight in NGN
	InBand         bool       `json:"in_band"`     // true if within min_pct..max_pct
}

type RebalancingSuggestion struct {
	InstrumentID   uuid.UUID `json:"instrument_id"`
	Ticker         string    `json:"ticker"`
	Name           string    `json:"name"`
	Action         string    `json:"action"` // "buy" or "sell"
	Quantity       float64   `json:"quantity"`
	EstimatedValue float64   `json:"estimated_value"`
	CurrentPrice   float64   `json:"current_price"`
	Rationale      string    `json:"rationale"`
}

type RebalancingAnalysis struct {
	FundID      uuid.UUID               `json:"fund_id"`
	FundName    string                  `json:"fund_name"`
	TotalNAV    float64                 `json:"total_nav"`
	Drift       []DriftItem             `json:"drift"`
	Suggestions []RebalancingSuggestion `json:"suggestions"`
	NeedsAction bool                    `json:"needs_action"`
}

// ── holdingRow is an internal struct used during analysis ─────────────────────

type holdingRow struct {
	instrumentID uuid.UUID
	ticker       string
	name         string
	assetClass   string
	issuer       string
	sector       string
	marketValue  float64
	marketPrice  float64
}

// ── SetTargetAllocation ───────────────────────────────────────────────────────

func (s *Service) SetTargetAllocation(ctx context.Context, in SetTargetAllocationInput, byID uuid.UUID) (TargetAllocation, error) {
	if in.AllocationType == "" {
		return TargetAllocation{}, fmt.Errorf("portfolio: allocation_type required")
	}
	if in.AllocationType == "instrument" && in.InstrumentID == nil {
		return TargetAllocation{}, fmt.Errorf("portfolio: instrument_id required for allocation_type=instrument")
	}

	const q = `
		INSERT INTO portfolio.target_allocation
		    (fund_id, allocation_type, instrument_id, label, target_pct, min_pct, max_pct, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (fund_id, allocation_type, COALESCE(instrument_id, '00000000-0000-0000-0000-000000000000'::uuid), label)
		DO UPDATE SET
		    target_pct  = EXCLUDED.target_pct,
		    min_pct     = EXCLUDED.min_pct,
		    max_pct     = EXCLUDED.max_pct,
		    is_active   = true,
		    updated_at  = now()
		RETURNING id
	`
	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, q,
		in.FundID, in.AllocationType, in.InstrumentID, in.Label,
		in.TargetPct, in.MinPct, in.MaxPct, byID,
	).Scan(&id); err != nil {
		return TargetAllocation{}, fmt.Errorf("portfolio: set target allocation: %w", err)
	}
	return s.getTargetAllocation(ctx, id)
}

func (s *Service) getTargetAllocation(ctx context.Context, id uuid.UUID) (TargetAllocation, error) {
	const q = `
		SELECT ta.id, ta.fund_id, ta.allocation_type, ta.instrument_id,
		       COALESCE(i.name, ''),   COALESCE(i.ticker, ''),
		       ta.label, ta.target_pct::float8, ta.min_pct::float8, ta.max_pct::float8,
		       ta.is_active, ta.created_at
		FROM   portfolio.target_allocation ta
		LEFT   JOIN portfolio.instrument i ON i.id = ta.instrument_id
		WHERE  ta.id = $1
	`
	var ta TargetAllocation
	if err := s.pool.QueryRow(ctx, q, id).Scan(
		&ta.ID, &ta.FundID, &ta.AllocationType, &ta.InstrumentID,
		&ta.InstrumentName, &ta.Ticker,
		&ta.Label, &ta.TargetPct, &ta.MinPct, &ta.MaxPct,
		&ta.IsActive, &ta.CreatedAt,
	); err != nil {
		return TargetAllocation{}, fmt.Errorf("portfolio: target allocation not found: %w", err)
	}
	return ta, nil
}

// ── ListTargetAllocations ─────────────────────────────────────────────────────

func (s *Service) ListTargetAllocations(ctx context.Context, fundID uuid.UUID) ([]TargetAllocation, error) {
	const q = `
		SELECT ta.id, ta.fund_id, ta.allocation_type, ta.instrument_id,
		       COALESCE(i.name, ''),   COALESCE(i.ticker, ''),
		       ta.label, ta.target_pct::float8, ta.min_pct::float8, ta.max_pct::float8,
		       ta.is_active, ta.created_at
		FROM   portfolio.target_allocation ta
		LEFT   JOIN portfolio.instrument i ON i.id = ta.instrument_id
		WHERE  ta.fund_id = $1
		ORDER  BY ta.allocation_type, ta.label, ta.created_at
	`
	rows, err := s.pool.Query(ctx, q, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: list target allocations: %w", err)
	}
	defer rows.Close()

	var out []TargetAllocation
	for rows.Next() {
		var ta TargetAllocation
		if err := rows.Scan(
			&ta.ID, &ta.FundID, &ta.AllocationType, &ta.InstrumentID,
			&ta.InstrumentName, &ta.Ticker,
			&ta.Label, &ta.TargetPct, &ta.MinPct, &ta.MaxPct,
			&ta.IsActive, &ta.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("portfolio: scan target allocation: %w", err)
		}
		out = append(out, ta)
	}
	return out, rows.Err()
}

// ── DeleteTargetAllocation ────────────────────────────────────────────────────

func (s *Service) DeleteTargetAllocation(ctx context.Context, id uuid.UUID) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM portfolio.target_allocation WHERE id = $1`, id,
	); err != nil {
		return fmt.Errorf("portfolio: delete target allocation: %w", err)
	}
	return nil
}

// ── AnalyseDrift ──────────────────────────────────────────────────────────────

func (s *Service) AnalyseDrift(ctx context.Context, fundID uuid.UUID) (RebalancingAnalysis, error) {
	fund, err := s.getFund(ctx, fundID)
	if err != nil {
		return RebalancingAnalysis{}, err
	}

	// 1. Load all active target allocations for the fund.
	targets, err := s.listActiveTargetAllocations(ctx, fundID)
	if err != nil {
		return RebalancingAnalysis{}, err
	}

	// 2. Load all holdings with market_value > 0.
	holdings, err := s.loadHoldingsForAnalysis(ctx, fundID)
	if err != nil {
		return RebalancingAnalysis{}, err
	}

	// 3. Compute total NAV.
	var totalNAV float64
	for _, h := range holdings {
		totalNAV += h.marketValue
	}

	// 4. Compute drift for each target allocation.
	var driftItems []DriftItem
	needsAction := false

	for _, ta := range targets {
		currentValue := computeCurrentValue(ta, holdings)
		var currentPct float64
		if totalNAV > 0 {
			currentPct = currentValue / totalNAV * 100
		}
		targetValue := totalNAV * ta.TargetPct / 100
		driftPct := currentPct - ta.TargetPct
		driftValue := totalNAV * driftPct / 100
		inBand := currentPct >= ta.MinPct && currentPct <= ta.MaxPct

		if !inBand {
			needsAction = true
		}

		item := DriftItem{
			Label:          ta.Label,
			AllocationType: ta.AllocationType,
			InstrumentID:   ta.InstrumentID,
			Ticker:         ta.Ticker,
			CurrentPct:     round2(currentPct),
			TargetPct:      round2(ta.TargetPct),
			DriftPct:       round2(driftPct),
			CurrentValue:   round2(currentValue),
			TargetValue:    round2(targetValue),
			DriftValue:     round2(driftValue),
			InBand:         inBand,
		}
		driftItems = append(driftItems, item)
	}

	return RebalancingAnalysis{
		FundID:      fundID,
		FundName:    fund.Name,
		TotalNAV:    round2(totalNAV),
		Drift:       driftItems,
		Suggestions: nil,
		NeedsAction: needsAction,
	}, nil
}

// ── GenerateRebalancingTrades ─────────────────────────────────────────────────

func (s *Service) GenerateRebalancingTrades(ctx context.Context, fundID uuid.UUID) (RebalancingAnalysis, error) {
	analysis, err := s.AnalyseDrift(ctx, fundID)
	if err != nil {
		return RebalancingAnalysis{}, err
	}

	holdings, err := s.loadHoldingsForAnalysis(ctx, fundID)
	if err != nil {
		return RebalancingAnalysis{}, err
	}

	// Build a map from instrument_id -> holdingRow for quick lookup.
	holdingsByID := make(map[uuid.UUID]holdingRow)
	for _, h := range holdings {
		holdingsByID[h.instrumentID] = h
	}

	var suggestions []RebalancingSuggestion

	for _, item := range analysis.Drift {
		if item.InBand {
			continue
		}

		switch item.AllocationType {
		case "instrument":
			if item.InstrumentID == nil {
				continue
			}
			h, ok := holdingsByID[*item.InstrumentID]
			if !ok || h.marketPrice <= 0 {
				continue
			}
			sugg := instrumentSuggestion(item, h)
			if sugg != nil {
				suggestions = append(suggestions, *sugg)
			}

		case "asset_class", "sector", "issuer":
			// Find the largest position in that group and suggest the corrective trade on it.
			best := largestHoldingInGroup(item, holdings)
			if best == nil || best.marketPrice <= 0 {
				continue
			}
			sugg := groupSuggestion(item, *best)
			if sugg != nil {
				suggestions = append(suggestions, *sugg)
			}
		}
	}

	analysis.Suggestions = suggestions
	return analysis, nil
}

// ── ExecuteRebalancing ────────────────────────────────────────────────────────

func (s *Service) ExecuteRebalancing(ctx context.Context, fundID uuid.UUID, byID uuid.UUID, byName string) ([]Transaction, error) {
	analysis, err := s.GenerateRebalancingTrades(ctx, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: generate rebalancing trades: %w", err)
	}

	today := time.Now().Format("2006-01-02")
	var txns []Transaction

	for _, sugg := range analysis.Suggestions {
		if sugg.Quantity <= 0 || sugg.CurrentPrice <= 0 {
			continue
		}

		in := TradeInput{
			FundID:       fundID,
			InstrumentID: sugg.InstrumentID,
			TxnType:      sugg.Action,
			TradeDate:    today,
			Quantity:     round2(sugg.Quantity),
			Price:        sugg.CurrentPrice,
			Narration:    fmt.Sprintf("Rebalancing %s: %s", sugg.Action, sugg.Rationale),
		}

		txn, err := s.BookTrade(ctx, in, byID, byName)
		if err != nil {
			return txns, fmt.Errorf("portfolio: execute rebalancing trade (%s %s): %w", sugg.Action, sugg.Ticker, err)
		}
		txns = append(txns, txn)
	}

	return txns, nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (s *Service) listActiveTargetAllocations(ctx context.Context, fundID uuid.UUID) ([]TargetAllocation, error) {
	const q = `
		SELECT ta.id, ta.fund_id, ta.allocation_type, ta.instrument_id,
		       COALESCE(i.name, ''),   COALESCE(i.ticker, ''),
		       ta.label, ta.target_pct::float8, ta.min_pct::float8, ta.max_pct::float8,
		       ta.is_active, ta.created_at
		FROM   portfolio.target_allocation ta
		LEFT   JOIN portfolio.instrument i ON i.id = ta.instrument_id
		WHERE  ta.fund_id = $1 AND ta.is_active = true
		ORDER  BY ta.allocation_type, ta.label
	`
	rows, err := s.pool.Query(ctx, q, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: list active target allocations: %w", err)
	}
	defer rows.Close()

	var out []TargetAllocation
	for rows.Next() {
		var ta TargetAllocation
		if err := rows.Scan(
			&ta.ID, &ta.FundID, &ta.AllocationType, &ta.InstrumentID,
			&ta.InstrumentName, &ta.Ticker,
			&ta.Label, &ta.TargetPct, &ta.MinPct, &ta.MaxPct,
			&ta.IsActive, &ta.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, ta)
	}
	return out, rows.Err()
}

func (s *Service) loadHoldingsForAnalysis(ctx context.Context, fundID uuid.UUID) ([]holdingRow, error) {
	const q = `
		SELECT h.instrument_id,
		       i.ticker, i.name, i.asset_class, i.issuer, i.sector,
		       COALESCE(h.market_value, 0)::float8,
		       COALESCE(h.market_price, 0)::float8
		FROM   portfolio.holding    h
		JOIN   portfolio.instrument i ON i.id = h.instrument_id
		WHERE  h.fund_id = $1 AND COALESCE(h.market_value, 0) > 0
		ORDER  BY h.market_value DESC
	`
	rows, err := s.pool.Query(ctx, q, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: load holdings for analysis: %w", err)
	}
	defer rows.Close()

	var out []holdingRow
	for rows.Next() {
		var h holdingRow
		if err := rows.Scan(
			&h.instrumentID, &h.ticker, &h.name,
			&h.assetClass, &h.issuer, &h.sector,
			&h.marketValue, &h.marketPrice,
		); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// computeCurrentValue sums the market value of holdings that match a target allocation.
func computeCurrentValue(ta TargetAllocation, holdings []holdingRow) float64 {
	var total float64
	for _, h := range holdings {
		if matchesTarget(ta, h) {
			total += h.marketValue
		}
	}
	return total
}

func matchesTarget(ta TargetAllocation, h holdingRow) bool {
	switch ta.AllocationType {
	case "instrument":
		return ta.InstrumentID != nil && h.instrumentID == *ta.InstrumentID
	case "asset_class":
		return h.assetClass == ta.Label
	case "sector":
		return h.sector == ta.Label
	case "issuer":
		return h.issuer == ta.Label
	}
	return false
}

// largestHoldingInGroup returns the holding with the highest market value that
// belongs to the same group (asset_class / sector / issuer) as the drift item.
func largestHoldingInGroup(item DriftItem, holdings []holdingRow) *holdingRow {
	var best *holdingRow
	for i := range holdings {
		h := &holdings[i]
		var matches bool
		switch item.AllocationType {
		case "asset_class":
			matches = h.assetClass == item.Label
		case "sector":
			matches = h.sector == item.Label
		case "issuer":
			matches = h.issuer == item.Label
		}
		if matches && (best == nil || h.marketValue > best.marketValue) {
			best = h
		}
	}
	return best
}

// instrumentSuggestion builds a RebalancingSuggestion for a single-instrument drift.
func instrumentSuggestion(item DriftItem, h holdingRow) *RebalancingSuggestion {
	absDriftValue := math.Abs(item.DriftValue)
	if absDriftValue < 0.01 {
		return nil
	}
	qty := absDriftValue / h.marketPrice

	var action, rationale string
	if item.DriftValue > 0 {
		action = "sell"
		rationale = fmt.Sprintf(
			"%s is overweight by %.2f%% (current %.2f%%, target %.2f%%). Sell %.4f units to reduce by ~%.2f",
			h.ticker, item.DriftPct, item.CurrentPct, item.TargetPct, qty, absDriftValue,
		)
	} else {
		action = "buy"
		rationale = fmt.Sprintf(
			"%s is underweight by %.2f%% (current %.2f%%, target %.2f%%). Buy %.4f units to add ~%.2f",
			h.ticker, -item.DriftPct, item.CurrentPct, item.TargetPct, qty, absDriftValue,
		)
	}

	return &RebalancingSuggestion{
		InstrumentID:   h.instrumentID,
		Ticker:         h.ticker,
		Name:           h.name,
		Action:         action,
		Quantity:       round2(qty),
		EstimatedValue: round2(absDriftValue),
		CurrentPrice:   h.marketPrice,
		Rationale:      rationale,
	}
}

// groupSuggestion builds a RebalancingSuggestion for a group-level (asset_class/sector/issuer) drift
// by trading the largest position in that group.
func groupSuggestion(item DriftItem, h holdingRow) *RebalancingSuggestion {
	absDriftValue := math.Abs(item.DriftValue)
	if absDriftValue < 0.01 {
		return nil
	}
	qty := absDriftValue / h.marketPrice

	groupDesc := fmt.Sprintf("%s '%s'", item.AllocationType, item.Label)
	var action, rationale string
	if item.DriftValue > 0 {
		action = "sell"
		rationale = fmt.Sprintf(
			"%s is overweight by %.2f%% (current %.2f%%, target %.2f%%). Selling largest position %s (%.4f units ~%.2f) to correct %s drift",
			groupDesc, item.DriftPct, item.CurrentPct, item.TargetPct, h.ticker, qty, absDriftValue, groupDesc,
		)
	} else {
		action = "buy"
		rationale = fmt.Sprintf(
			"%s is underweight by %.2f%% (current %.2f%%, target %.2f%%). Buying largest position %s (%.4f units ~%.2f) to correct %s drift",
			groupDesc, -item.DriftPct, item.CurrentPct, item.TargetPct, h.ticker, qty, absDriftValue, groupDesc,
		)
	}

	return &RebalancingSuggestion{
		InstrumentID:   h.instrumentID,
		Ticker:         h.ticker,
		Name:           h.name,
		Action:         action,
		Quantity:       round2(qty),
		EstimatedValue: round2(absDriftValue),
		CurrentPrice:   h.marketPrice,
		Rationale:      rationale,
	}
}
