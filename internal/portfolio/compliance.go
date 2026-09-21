package portfolio

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ── Compliance types ──────────────────────────────────────────────────────────

type ComplianceRule struct {
	ID        uuid.UUID `json:"id"`
	FundID    uuid.UUID `json:"fund_id"`
	FundName  string    `json:"fund_name"`
	RuleType  string    `json:"rule_type"`
	Target    string    `json:"target"`
	LimitPct  float64   `json:"limit_pct"`
	IsActive  bool      `json:"is_active"`
	CreatedBy uuid.UUID `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateComplianceRuleInput struct {
	FundID   uuid.UUID `json:"fund_id"`
	RuleType string    `json:"rule_type"`
	Target   string    `json:"target"`
	LimitPct float64   `json:"limit_pct"`
}

type ComplianceBreach struct {
	ID              uuid.UUID  `json:"id"`
	FundID          uuid.UUID  `json:"fund_id"`
	FundName        string     `json:"fund_name"`
	RuleID          uuid.UUID  `json:"rule_id"`
	RuleType        string     `json:"rule_type"`
	Target          string     `json:"target"`
	BreachDate      time.Time  `json:"breach_date"`
	CurrentPct      float64    `json:"current_pct"`
	LimitPct        float64    `json:"limit_pct"`
	Status          string     `json:"status"`
	AcknowledgedBy  *uuid.UUID `json:"acknowledged_by,omitempty"`
	AcknowledgedAt  *time.Time `json:"acknowledged_at,omitempty"`
	ResolutionNotes string     `json:"resolution_notes"`
	CreatedAt       time.Time  `json:"created_at"`
}

type ComplianceCheckResult struct {
	FundID    uuid.UUID          `json:"fund_id"`
	CheckDate time.Time          `json:"check_date"`
	Breaches  []ComplianceBreach `json:"breaches"`
	Clean     bool               `json:"clean"`
}

// ── Valid rule types ──────────────────────────────────────────────────────────

var validRuleTypes = map[string]bool{
	"max_single_issuer":     true,
	"max_asset_class":       true,
	"min_asset_class":       true,
	"max_single_instrument": true,
	"min_cash":              true,
	"max_single_sector":     true,
}

// ── CreateComplianceRule ──────────────────────────────────────────────────────

func (s *Service) CreateComplianceRule(ctx context.Context, in CreateComplianceRuleInput, byID uuid.UUID) (ComplianceRule, error) {
	if !validRuleTypes[in.RuleType] {
		return ComplianceRule{}, fmt.Errorf("portfolio: invalid rule_type %q", in.RuleType)
	}
	if in.LimitPct <= 0 || in.LimitPct > 100 {
		return ComplianceRule{}, fmt.Errorf("portfolio: limit_pct must be between 0 and 100")
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO portfolio.compliance_rule (fund_id, rule_type, target, limit_pct, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, in.FundID, in.RuleType, in.Target, in.LimitPct, byID).Scan(&id); err != nil {
		return ComplianceRule{}, fmt.Errorf("portfolio: create compliance rule: %w", err)
	}
	return s.getComplianceRule(ctx, id)
}

func (s *Service) getComplianceRule(ctx context.Context, id uuid.UUID) (ComplianceRule, error) {
	var r ComplianceRule
	if err := s.pool.QueryRow(ctx, `
		SELECT cr.id, cr.fund_id, f.name, cr.rule_type, cr.target,
		       cr.limit_pct::float8, cr.is_active, cr.created_by, cr.created_at
		FROM   portfolio.compliance_rule cr
		JOIN   portfolio.fund f ON f.id = cr.fund_id
		WHERE  cr.id = $1
	`, id).Scan(
		&r.ID, &r.FundID, &r.FundName, &r.RuleType, &r.Target,
		&r.LimitPct, &r.IsActive, &r.CreatedBy, &r.CreatedAt,
	); err != nil {
		return ComplianceRule{}, fmt.Errorf("portfolio: compliance rule not found: %w", err)
	}
	return r, nil
}

// ── ListComplianceRules ───────────────────────────────────────────────────────

func (s *Service) ListComplianceRules(ctx context.Context, fundID uuid.UUID) ([]ComplianceRule, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT cr.id, cr.fund_id, f.name, cr.rule_type, cr.target,
		       cr.limit_pct::float8, cr.is_active, cr.created_by, cr.created_at
		FROM   portfolio.compliance_rule cr
		JOIN   portfolio.fund f ON f.id = cr.fund_id
		WHERE  cr.fund_id = $1
		ORDER  BY cr.rule_type, cr.created_at
	`, fundID)
	if err != nil {
		return nil, fmt.Errorf("portfolio: list compliance rules: %w", err)
	}
	defer rows.Close()

	var out []ComplianceRule
	for rows.Next() {
		var r ComplianceRule
		if err := rows.Scan(
			&r.ID, &r.FundID, &r.FundName, &r.RuleType, &r.Target,
			&r.LimitPct, &r.IsActive, &r.CreatedBy, &r.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("portfolio: scan compliance rule: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ── DeleteComplianceRule ──────────────────────────────────────────────────────

func (s *Service) DeleteComplianceRule(ctx context.Context, ruleID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM portfolio.compliance_rule WHERE id = $1
	`, ruleID)
	if err != nil {
		return fmt.Errorf("portfolio: delete compliance rule: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("portfolio: compliance rule not found")
	}
	return nil
}

// ── CheckCompliance ───────────────────────────────────────────────────────────

// holdingData is used internally during the compliance check.
type holdingData struct {
	marketValue float64
	assetClass  string
	issuer      string
	sector      string
	ticker      string
}

// CheckCompliance runs all active compliance rules for a fund and records any
// breaches. It returns the full check result including all discovered breaches.
func (s *Service) CheckCompliance(ctx context.Context, fundID uuid.UUID) (ComplianceCheckResult, error) {
	checkDate := time.Now().UTC()
	result := ComplianceCheckResult{
		FundID:    fundID,
		CheckDate: checkDate,
		Breaches:  []ComplianceBreach{},
		Clean:     true,
	}

	// 1. Load all active compliance rules for the fund.
	ruleRows, err := s.pool.Query(ctx, `
		SELECT id, rule_type, target, limit_pct::float8
		FROM   portfolio.compliance_rule
		WHERE  fund_id = $1 AND is_active = true
	`, fundID)
	if err != nil {
		return result, fmt.Errorf("portfolio: check compliance: load rules: %w", err)
	}
	type ruleRow struct {
		id       uuid.UUID
		ruleType string
		target   string
		limitPct float64
	}
	var rules []ruleRow
	for ruleRows.Next() {
		var r ruleRow
		if err := ruleRows.Scan(&r.id, &r.ruleType, &r.target, &r.limitPct); err != nil {
			ruleRows.Close()
			return result, fmt.Errorf("portfolio: check compliance: scan rule: %w", err)
		}
		rules = append(rules, r)
	}
	ruleRows.Close()
	if err := ruleRows.Err(); err != nil {
		return result, fmt.Errorf("portfolio: check compliance: rules rows: %w", err)
	}

	if len(rules) == 0 {
		return result, nil
	}

	// 2. Load all holdings with market_value > 0, joined with instrument.
	hRows, err := s.pool.Query(ctx, `
		SELECT h.market_value::float8, i.asset_class, i.issuer, i.sector, i.ticker
		FROM   portfolio.holding h
		JOIN   portfolio.instrument i ON i.id = h.instrument_id
		WHERE  h.fund_id = $1 AND h.market_value > 0
	`, fundID)
	if err != nil {
		return result, fmt.Errorf("portfolio: check compliance: load holdings: %w", err)
	}
	var holdings []holdingData
	for hRows.Next() {
		var h holdingData
		if err := hRows.Scan(&h.marketValue, &h.assetClass, &h.issuer, &h.sector, &h.ticker); err != nil {
			hRows.Close()
			return result, fmt.Errorf("portfolio: check compliance: scan holding: %w", err)
		}
		holdings = append(holdings, h)
	}
	hRows.Close()
	if err := hRows.Err(); err != nil {
		return result, fmt.Errorf("portfolio: check compliance: holdings rows: %w", err)
	}

	// 3. Compute total market value.
	var totalMV float64
	for _, h := range holdings {
		totalMV += h.marketValue
	}
	if totalMV == 0 {
		// Nothing to check against — no positions.
		return result, nil
	}

	// 4. Evaluate each rule.
	dateStr := checkDate.Format("2006-01-02")

	for _, rule := range rules {
		currentPct := s.computeConcentration(rule.ruleType, rule.target, holdings, totalMV)
		breached := isBreached(rule.ruleType, currentPct, rule.limitPct)

		if !breached {
			continue
		}

		// 5. Record breach if not already open for the same fund+rule+date.
		var existingID uuid.UUID
		_ = s.pool.QueryRow(ctx, `
			SELECT id FROM portfolio.compliance_breach
			WHERE  fund_id = $1 AND rule_id = $2 AND breach_date::text = $3 AND status = 'open'
			LIMIT  1
		`, fundID, rule.id, dateStr).Scan(&existingID)

		var breachID uuid.UUID
		if existingID == (uuid.UUID{}) {
			// No existing open breach for this fund+rule+date — insert a new one.
			if err := s.pool.QueryRow(ctx, `
				INSERT INTO portfolio.compliance_breach
				    (fund_id, rule_id, breach_date, current_pct, limit_pct, status)
				VALUES ($1, $2, $3, $4, $5, 'open')
				RETURNING id
			`, fundID, rule.id, dateStr, round2(currentPct), rule.limitPct).Scan(&breachID); err != nil {
				// Non-fatal: log and continue so other rules still run.
				_ = err
				continue
			}
		} else {
			breachID = existingID
			// Update current_pct on the existing open breach.
			_, _ = s.pool.Exec(ctx, `
				UPDATE portfolio.compliance_breach
				SET    current_pct = $2
				WHERE  id = $1
			`, breachID, round2(currentPct))
		}

		breach, err := s.getComplianceBreach(ctx, breachID)
		if err != nil {
			continue
		}
		result.Breaches = append(result.Breaches, breach)
		result.Clean = false
	}

	return result, nil
}

// computeConcentration returns the concentration percentage for a given rule
// across the provided holdings relative to totalMV.
func (s *Service) computeConcentration(ruleType, target string, holdings []holdingData, totalMV float64) float64 {
	switch ruleType {
	case "max_single_issuer":
		// Group by issuer, return the maximum group sum as a percentage.
		byIssuer := make(map[string]float64)
		for _, h := range holdings {
			byIssuer[h.issuer] += h.marketValue
		}
		var maxVal float64
		for _, v := range byIssuer {
			if v > maxVal {
				maxVal = v
			}
		}
		return maxVal / totalMV * 100

	case "max_asset_class":
		// Concentration of the specific asset class named in target.
		var sum float64
		for _, h := range holdings {
			if h.assetClass == target {
				sum += h.marketValue
			}
		}
		return sum / totalMV * 100

	case "min_asset_class":
		// Same grouping — breach if below minimum.
		var sum float64
		for _, h := range holdings {
			if h.assetClass == target {
				sum += h.marketValue
			}
		}
		return sum / totalMV * 100

	case "max_single_instrument":
		// Concentration of the single instrument whose ticker matches target.
		var sum float64
		for _, h := range holdings {
			if h.ticker == target {
				sum += h.marketValue
			}
		}
		return sum / totalMV * 100

	case "min_cash":
		// Concentration of the cash_equivalent asset class.
		var sum float64
		for _, h := range holdings {
			if h.assetClass == "cash_equivalent" {
				sum += h.marketValue
			}
		}
		return sum / totalMV * 100

	case "max_single_sector":
		if target != "" {
			// Check a specific sector named in target.
			var sum float64
			for _, h := range holdings {
				if h.sector == target {
					sum += h.marketValue
				}
			}
			return sum / totalMV * 100
		}
		// No target specified — return the largest sector concentration.
		bySector := make(map[string]float64)
		for _, h := range holdings {
			bySector[h.sector] += h.marketValue
		}
		var maxVal float64
		for _, v := range bySector {
			if v > maxVal {
				maxVal = v
			}
		}
		return maxVal / totalMV * 100
	}

	return 0
}

// isBreached returns true when the computed concentration violates the rule's
// limit. Min rules breach when the concentration falls below the limit; max
// rules breach when it exceeds the limit.
func isBreached(ruleType string, currentPct, limitPct float64) bool {
	switch ruleType {
	case "min_asset_class", "min_cash":
		return currentPct < limitPct
	default:
		return currentPct > limitPct
	}
}

// ── ListBreaches ──────────────────────────────────────────────────────────────

func (s *Service) ListBreaches(ctx context.Context, fundID *uuid.UUID, status string) ([]ComplianceBreach, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT cb.id, cb.fund_id, f.name,
		       cb.rule_id, cr.rule_type, cr.target,
		       cb.breach_date, cb.current_pct::float8, cb.limit_pct::float8,
		       cb.status, cb.acknowledged_by, cb.acknowledged_at,
		       COALESCE(cb.resolution_notes, ''), cb.created_at
		FROM   portfolio.compliance_breach cb
		JOIN   portfolio.fund f             ON f.id  = cb.fund_id
		JOIN   portfolio.compliance_rule cr ON cr.id = cb.rule_id
		WHERE  ($1::uuid IS NULL OR cb.fund_id = $1)
		  AND  ($2 = ''          OR cb.status  = $2)
		ORDER  BY cb.breach_date DESC, cb.created_at DESC
	`, fundID, status)
	if err != nil {
		return nil, fmt.Errorf("portfolio: list breaches: %w", err)
	}
	defer rows.Close()
	return scanBreaches(rows)
}

// ── AcknowledgeBreach ─────────────────────────────────────────────────────────

func (s *Service) AcknowledgeBreach(ctx context.Context, breachID uuid.UUID, byID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE portfolio.compliance_breach
		SET    status          = 'acknowledged',
		       acknowledged_by = $2,
		       acknowledged_at = now()
		WHERE  id = $1 AND status = 'open'
	`, breachID, byID)
	if err != nil {
		return fmt.Errorf("portfolio: acknowledge breach: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("portfolio: breach not found or not in open status")
	}
	return nil
}

// ── ResolveBreach ─────────────────────────────────────────────────────────────

func (s *Service) ResolveBreach(ctx context.Context, breachID uuid.UUID, notes string, byID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE portfolio.compliance_breach
		SET    status           = 'resolved',
		       resolution_notes = $2,
		       acknowledged_by  = COALESCE(acknowledged_by, $3),
		       acknowledged_at  = COALESCE(acknowledged_at, now())
		WHERE  id = $1 AND status != 'resolved'
	`, breachID, notes, byID)
	if err != nil {
		return fmt.Errorf("portfolio: resolve breach: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("portfolio: breach not found or already resolved")
	}
	return nil
}

// ── RunComplianceForAllFunds ──────────────────────────────────────────────────

// RunComplianceForAllFunds runs CheckCompliance for every active fund and
// returns all results. Intended to be called by the daily scheduler.
func (s *Service) RunComplianceForAllFunds(ctx context.Context) ([]ComplianceCheckResult, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id FROM portfolio.fund WHERE status = 'active'
	`)
	if err != nil {
		return nil, fmt.Errorf("portfolio: run compliance all funds: %w", err)
	}
	var fundIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, fmt.Errorf("portfolio: run compliance all funds: scan: %w", err)
		}
		fundIDs = append(fundIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("portfolio: run compliance all funds: rows: %w", err)
	}

	var results []ComplianceCheckResult
	for _, fid := range fundIDs {
		res, err := s.CheckCompliance(ctx, fid)
		if err != nil {
			// Non-fatal: continue with remaining funds.
			_ = err
			continue
		}
		results = append(results, res)
	}
	return results, nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (s *Service) getComplianceBreach(ctx context.Context, id uuid.UUID) (ComplianceBreach, error) {
	var b ComplianceBreach
	if err := s.pool.QueryRow(ctx, `
		SELECT cb.id, cb.fund_id, f.name,
		       cb.rule_id, cr.rule_type, cr.target,
		       cb.breach_date, cb.current_pct::float8, cb.limit_pct::float8,
		       cb.status, cb.acknowledged_by, cb.acknowledged_at,
		       COALESCE(cb.resolution_notes, ''), cb.created_at
		FROM   portfolio.compliance_breach cb
		JOIN   portfolio.fund f             ON f.id  = cb.fund_id
		JOIN   portfolio.compliance_rule cr ON cr.id = cb.rule_id
		WHERE  cb.id = $1
	`, id).Scan(
		&b.ID, &b.FundID, &b.FundName,
		&b.RuleID, &b.RuleType, &b.Target,
		&b.BreachDate, &b.CurrentPct, &b.LimitPct,
		&b.Status, &b.AcknowledgedBy, &b.AcknowledgedAt,
		&b.ResolutionNotes, &b.CreatedAt,
	); err != nil {
		return ComplianceBreach{}, fmt.Errorf("portfolio: compliance breach not found: %w", err)
	}
	return b, nil
}

func scanBreaches(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]ComplianceBreach, error) {
	var out []ComplianceBreach
	for rows.Next() {
		var b ComplianceBreach
		if err := rows.Scan(
			&b.ID, &b.FundID, &b.FundName,
			&b.RuleID, &b.RuleType, &b.Target,
			&b.BreachDate, &b.CurrentPct, &b.LimitPct,
			&b.Status, &b.AcknowledgedBy, &b.AcknowledgedAt,
			&b.ResolutionNotes, &b.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("portfolio: scan breach: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
