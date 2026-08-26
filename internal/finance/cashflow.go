package finance

import (
	"context"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── Cash Flow Statement (indirect method) ────────────────────────────────────
//
// Indirect method: start from net income, add back non-cash items, then adjust
// for movements in balance-sheet working-capital accounts.
//
// Sign convention: positive = cash inflow, negative = cash outflow.

type CashFlowLine struct {
	Label  string  `json:"label"`
	Amount float64 `json:"amount"`
}

type CashFlowSection struct {
	Title string         `json:"title"`
	Lines []CashFlowLine `json:"lines"`
	Total float64        `json:"total"`
}

type CashFlowReport struct {
	From        string          `json:"from"`
	To          string          `json:"to"`
	Operating   CashFlowSection `json:"operating"`
	Investing   CashFlowSection `json:"investing"`
	Financing   CashFlowSection `json:"financing"`
	NetChange   float64         `json:"net_change"`
	OpeningCash float64         `json:"opening_cash"`
	ClosingCash float64         `json:"closing_cash"`
}

func (s *Service) GetCashFlow(ctx context.Context, from, to string, subsidiaryID *uuid.UUID) (CashFlowReport, error) {
	// ── 1. Net income from P&L ────────────────────────────────────────────────
	pl, err := s.GetProfitAndLoss(ctx, from, to, subsidiaryID)
	if err != nil {
		return CashFlowReport{}, err
	}
	netIncome := math.Round(pl.NetIncome*100) / 100

	// ── 2. All balance sheet account movements for the period ─────────────────
	// net_debit = SUM(debit) – SUM(credit).
	// CF impact = –net_debit:
	//   asset up   → net_debit > 0 → CF < 0 (cash used)
	//   asset down → net_debit < 0 → CF > 0 (cash released)
	//   liab  up   → net_debit < 0 → CF > 0 (cash generated)
	//   liab  down → net_debit > 0 → CF < 0 (cash paid out)
	const bsQ = `
		SELECT l.account_code, COALESCE(SUM(l.debit - l.credit), 0)::float8
		FROM   finance.journal_line   l
		JOIN   finance.journal_header h ON h.id = l.journal_id
		WHERE  h.status = 'posted'
		  AND  ($1::text = '' OR h.date::text >= $1)
		  AND  ($2::text = '' OR h.date::text <= $2)
		  AND  ($3 = '' OR h.subsidiary_id::text = $3)
		  AND  l.account_code NOT LIKE '4%'
		  AND  l.account_code NOT LIKE '5%'
		GROUP  BY l.account_code
	`
	rows, err := s.pool.Query(ctx, bsQ, from, to, subStr(subsidiaryID))
	if err != nil {
		return CashFlowReport{}, err
	}
	defer rows.Close()
	mv := make(map[string]float64)
	for rows.Next() {
		var code string
		var net float64
		if err := rows.Scan(&code, &net); err != nil {
			return CashFlowReport{}, err
		}
		mv[code] = net
	}
	if err := rows.Err(); err != nil {
		return CashFlowReport{}, err
	}

	// Helper: CF impact for a set of codes = –Σ net_debit
	cf := func(codes ...string) float64 {
		var sum float64
		for _, c := range codes {
			sum += mv[c]
		}
		return math.Round(-sum*100) / 100
	}

	// Helper: CF impact for all codes with a given prefix
	cfPrefix := func(prefix string) float64 {
		var sum float64
		for k, v := range mv {
			if strings.HasPrefix(k, prefix) {
				sum += v
			}
		}
		return math.Round(-sum*100) / 100
	}

	// ── 3. Depreciation & amortisation (add back — non-cash charge) ──────────
	const depQ = `
		SELECT COALESCE(SUM(l.debit - l.credit), 0)::float8
		FROM   finance.journal_line   l
		JOIN   finance.journal_header h ON h.id = l.journal_id
		WHERE  h.status = 'posted'
		  AND  ($1::text = '' OR h.date::text >= $1)
		  AND  ($2::text = '' OR h.date::text <= $2)
		  AND  ($3 = '' OR h.subsidiary_id::text = $3)
		  AND  l.account_code IN ('5600','5601','5602','5603','5604')
	`
	var depreciation float64
	_ = s.pool.QueryRow(ctx, depQ, from, to, subStr(subsidiaryID)).Scan(&depreciation)
	depreciation = math.Round(depreciation*100) / 100

	// ── 4. Build sections ─────────────────────────────────────────────────────

	// Operating
	deltaReceivables     := cf("1130","1131","1132","1133","1134")
	deltaPrepayments     := cf("1140","1141","1142")
	deltaOtherCA         := cf("1150","1160","1190")
	deltaPayables        := cf("2101")
	deltaAccruals        := cf("2102","2103")
	deltaTaxPayables     := cf("2120","2121","2122","2123","2124")
	deltaPensionSalaries := cf("2130","2140")
	deltaDeferredRev     := cf("2160")

	opLines := []CashFlowLine{
		{Label: "Net profit for the period",           Amount: netIncome},
		{Label: "Add: Depreciation & amortisation",   Amount: depreciation},
		{Label: "Change in trade receivables",         Amount: deltaReceivables},
		{Label: "Change in prepaid expenses",          Amount: deltaPrepayments},
		{Label: "Change in other current assets",      Amount: deltaOtherCA},
		{Label: "Change in accounts payable",          Amount: deltaPayables},
		{Label: "Change in accrued expenses",          Amount: deltaAccruals},
		{Label: "Change in tax payables (PAYE/VAT/WHT)", Amount: deltaTaxPayables},
		{Label: "Change in pension & salary payables", Amount: deltaPensionSalaries},
		{Label: "Change in deferred revenue",          Amount: deltaDeferredRev},
	}
	var opTotal float64
	for _, l := range opLines {
		opTotal += l.Amount
	}
	opTotal = math.Round(opTotal*100) / 100

	// Investing: fixed assets (gross cost movement) + investment assets
	fixedAssets  := cf("1301","1302","1303","1304","1320")
	investments  := cfPrefix("120")
	invLines := []CashFlowLine{
		{Label: "Purchase of property, plant & equipment", Amount: fixedAssets},
		{Label: "Net movement in investment assets",        Amount: investments},
	}
	var invTotal float64
	for _, l := range invLines {
		invTotal += l.Amount
	}
	invTotal = math.Round(invTotal*100) / 100

	// Financing: loans + equity
	loans         := cf("2201","2202","2290")
	capitalInject := cf("3001","3002")
	dividends     := cf("3003") // retained earnings decrease = dividend paid out = outflow
	finLines := []CashFlowLine{
		{Label: "Proceeds from / (repayment of) loans", Amount: loans},
		{Label: "Capital injections",                   Amount: capitalInject},
		{Label: "Dividends paid",                       Amount: dividends},
	}
	var finTotal float64
	for _, l := range finLines {
		finTotal += l.Amount
	}
	finTotal = math.Round(finTotal*100) / 100

	netChange := math.Round((opTotal+invTotal+finTotal)*100) / 100

	// ── 5. Opening and closing cash ───────────────────────────────────────────
	// Cash accounts: 1101, 1102, 1110-1114
	cashSum := func(upTo string) float64 {
		var sum float64
		_ = s.pool.QueryRow(ctx, `
			SELECT COALESCE(SUM(l.debit - l.credit), 0)::float8
			FROM   finance.journal_line   l
			JOIN   finance.journal_header h ON h.id = l.journal_id
			WHERE  h.status = 'posted'
			  AND  h.date::text <= $1
			  AND  ($2 = '' OR h.subsidiary_id::text = $2)
			  AND  l.account_code IN ('1101','1102','1110','1111','1112','1113','1114')
		`, upTo, subStr(subsidiaryID)).Scan(&sum)
		return math.Round(sum*100) / 100
	}

	var openingCash float64
	if from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			dayBefore := t.AddDate(0, 0, -1).Format("2006-01-02")
			openingCash = cashSum(dayBefore)
		}
	}
	closingCash := cashSum(to)

	return CashFlowReport{
		From: from, To: to,
		Operating: CashFlowSection{Title: "Operating Activities", Lines: opLines, Total: opTotal},
		Investing: CashFlowSection{Title: "Investing Activities", Lines: invLines, Total: invTotal},
		Financing: CashFlowSection{Title: "Financing Activities", Lines: finLines, Total: finTotal},
		NetChange:   netChange,
		OpeningCash: openingCash,
		ClosingCash: closingCash,
	}, nil
}
