package portfolio

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// ── Report types ──────────────────────────────────────────────────────────────

type ClientReport struct {
	Account      ClientAccount      `json:"account"`
	Fund         Fund               `json:"fund"`
	AsOf         time.Time          `json:"as_of"`
	Holdings     []Holding          `json:"holdings"`
	Transactions []ClientTransaction `json:"transactions"`
	Summary      ClientReportSummary `json:"summary"`
}

type ClientReportSummary struct {
	TotalInvested float64 `json:"total_invested"`
	CurrentValue  float64 `json:"current_value"`
	TotalReturn   float64 `json:"total_return"`
	ReturnPct     float64 `json:"return_pct"`
	RealizedPnL   float64 `json:"realized_pnl"`
	UnrealizedPnL float64 `json:"unrealized_pnl"`
	TotalFees     float64 `json:"total_fees"`
	TotalIncome   float64 `json:"total_income"` // dividends + coupons + interest received
	UnitsHeld     float64 `json:"units_held"`
	NAVPerUnit    float64 `json:"nav_per_unit"`
}

// ── GetClientReport ───────────────────────────────────────────────────────────

// GetClientReport loads a Client 360° Statement for the given account and date range.
func (s *Service) GetClientReport(ctx context.Context, accountID uuid.UUID, from, to time.Time) (ClientReport, error) {
	acc, err := s.getClientAccount(ctx, accountID)
	if err != nil {
		return ClientReport{}, fmt.Errorf("portfolio: client report: %w", err)
	}

	fund, err := s.getFund(ctx, acc.FundID)
	if err != nil {
		return ClientReport{}, fmt.Errorf("portfolio: client report: %w", err)
	}

	holdings, err := s.GetHoldings(ctx, acc.FundID)
	if err != nil {
		return ClientReport{}, fmt.Errorf("portfolio: client report holdings: %w", err)
	}

	fromStr := from.Format("2006-01-02")
	toStr := to.Format("2006-01-02")
	txns, err := s.GetClientStatement(ctx, accountID, fromStr, toStr)
	if err != nil {
		return ClientReport{}, fmt.Errorf("portfolio: client report transactions: %w", err)
	}

	// Compute summary
	var totalFees, totalIncome float64
	incomeTypes := map[string]bool{"dividend": true, "coupon": true, "interest": true}
	for _, t := range txns {
		totalFees += t.Fees
		if incomeTypes[t.TxnType] {
			totalIncome += t.Amount
		}
	}

	totalReturn := round2(acc.CurrentValue - acc.InvestedAmount)
	var returnPct float64
	if acc.InvestedAmount > 0 {
		returnPct = round2(totalReturn / acc.InvestedAmount * 100)
	}

	// Latest NAV per unit: derive from current_value / units_held if available
	var navPerUnit float64
	if acc.UnitsHeld > 0 {
		navPerUnit = round2(acc.CurrentValue / acc.UnitsHeld)
	}

	summary := ClientReportSummary{
		TotalInvested: round2(acc.InvestedAmount),
		CurrentValue:  round2(acc.CurrentValue),
		TotalReturn:   totalReturn,
		ReturnPct:     returnPct,
		RealizedPnL:   round2(acc.RealizedPnL),
		UnrealizedPnL: round2(acc.UnrealizedPnL),
		TotalFees:     round2(totalFees),
		TotalIncome:   round2(totalIncome),
		UnitsHeld:     round2(acc.UnitsHeld),
		NAVPerUnit:    navPerUnit,
	}

	return ClientReport{
		Account:      acc,
		Fund:         fund,
		AsOf:         to,
		Holdings:     holdings,
		Transactions: txns,
		Summary:      summary,
	}, nil
}

// ── ExportClientReportExcel ───────────────────────────────────────────────────

// ExportClientReportExcel generates a 4-sheet Excel workbook for the Client 360° Statement.
// Returns (excelBytes, filename, error).
func (s *Service) ExportClientReportExcel(ctx context.Context, accountID uuid.UUID, from, to time.Time) ([]byte, string, error) {
	report, err := s.GetClientReport(ctx, accountID, from, to)
	if err != nil {
		return nil, "", err
	}

	f := excelize.NewFile()

	// ── Styles ────────────────────────────────────────────────────────────────
	headerStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold:  true,
			Color: "FFFFFF",
		},
		Fill: excelize.Fill{
			Type:    "pattern",
			Pattern: 1,
			Color:   []string{"1a3c5e"},
		},
	})
	if err != nil {
		return nil, "", fmt.Errorf("portfolio: excel style: %w", err)
	}

	labelStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
	})
	if err != nil {
		return nil, "", fmt.Errorf("portfolio: excel style: %w", err)
	}

	// ── Sheet 1: Summary ──────────────────────────────────────────────────────
	const sh1 = "Summary"
	_ = f.SetSheetName("Sheet1", sh1)

	setClientCells(f, sh1, 1, []interface{}{"Client 360° Statement"})
	_ = f.SetCellStyle(sh1, "A1", "A1", labelStyle)

	setClientCells(f, sh1, 2, []interface{}{fmt.Sprintf("Period: %s to %s", from.Format("2006-01-02"), to.Format("2006-01-02"))})
	setClientCells(f, sh1, 3, []interface{}{fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05"))})

	acc := report.Account
	sum := report.Summary

	type kv struct{ k, v interface{} }
	accountFields := []kv{
		{"Account Number", acc.AccountNumber},
		{"Client Name", acc.ClientName},
		{"Fund", acc.FundName},
		{"Fund Type", acc.FundType},
		{"Currency", acc.Currency},
		{"Status", acc.Status},
		{"Opened Date", acc.OpenedDate},
		{"Relationship Manager", acc.RMName},
	}

	row := 5
	setClientCells(f, sh1, row, []interface{}{"Account Details", ""})
	_ = f.SetCellStyle(sh1, clientCell(1, row), clientCell(2, row), headerStyle)
	row++
	for _, kv := range accountFields {
		setClientCells(f, sh1, row, []interface{}{kv.k, kv.v})
		_ = f.SetCellStyle(sh1, clientCell(1, row), clientCell(1, row), labelStyle)
		row++
	}

	row++
	setClientCells(f, sh1, row, []interface{}{"Performance Summary", ""})
	_ = f.SetCellStyle(sh1, clientCell(1, row), clientCell(2, row), headerStyle)
	row++

	perfFields := []kv{
		{"Total Invested", sum.TotalInvested},
		{"Current Value", sum.CurrentValue},
		{"Total Return", sum.TotalReturn},
		{"Return %", fmt.Sprintf("%.2f%%", sum.ReturnPct)},
		{"Realized P&L", sum.RealizedPnL},
		{"Unrealized P&L", sum.UnrealizedPnL},
		{"Total Fees Paid", sum.TotalFees},
		{"Total Income Received", sum.TotalIncome},
		{"Units Held", sum.UnitsHeld},
		{"NAV per Unit", sum.NAVPerUnit},
	}
	for _, kv := range perfFields {
		setClientCells(f, sh1, row, []interface{}{kv.k, kv.v})
		_ = f.SetCellStyle(sh1, clientCell(1, row), clientCell(1, row), labelStyle)
		row++
	}

	// ── Sheet 2: Portfolio Holdings ───────────────────────────────────────────
	const sh2 = "Portfolio Holdings"
	_, _ = f.NewSheet(sh2)

	holdingHeaders := []interface{}{"Instrument", "Asset Class", "Quantity", "Book Value", "Market Value", "Unrealized P&L"}
	setClientCells(f, sh2, 1, holdingHeaders)
	_ = f.SetCellStyle(sh2, clientCell(1, 1), clientCell(len(holdingHeaders), 1), headerStyle)

	for i, h := range report.Holdings {
		mv := 0.0
		if h.MarketValue != nil {
			mv = *h.MarketValue
		}
		upnl := 0.0
		if h.UnrealizedPnL != nil {
			upnl = *h.UnrealizedPnL
		}
		setClientCells(f, sh2, i+2, []interface{}{
			h.InstrumentName,
			h.AssetClass,
			h.Quantity,
			h.BookValue,
			mv,
			upnl,
		})
	}

	// ── Sheet 3: Transactions ─────────────────────────────────────────────────
	const sh3 = "Transactions"
	_, _ = f.NewSheet(sh3)

	txnHeaders := []interface{}{"Date", "Type", "Amount", "Units", "NAV/Unit", "Fees", "Net Amount", "Running Balance", "Narration"}
	setClientCells(f, sh3, 1, txnHeaders)
	_ = f.SetCellStyle(sh3, clientCell(1, 1), clientCell(len(txnHeaders), 1), headerStyle)

	for i, t := range report.Transactions {
		setClientCells(f, sh3, i+2, []interface{}{
			t.TxnDate,
			t.TxnType,
			t.Amount,
			t.Units,
			t.NavPerUnit,
			t.Fees,
			t.NetAmount,
			t.RunningBalance,
			t.Narration,
		})
	}

	// ── Sheet 4: Performance ──────────────────────────────────────────────────
	const sh4 = "Performance"
	_, _ = f.NewSheet(sh4)

	perfHeaders := []interface{}{"Metric", "Value"}
	setClientCells(f, sh4, 1, perfHeaders)
	_ = f.SetCellStyle(sh4, clientCell(1, 1), clientCell(len(perfHeaders), 1), headerStyle)

	perfRows := [][]interface{}{
		{"Total Invested", sum.TotalInvested},
		{"Current Value", sum.CurrentValue},
		{"Total Return", sum.TotalReturn},
		{"Return %", fmt.Sprintf("%.2f%%", sum.ReturnPct)},
		{"Realized P&L", sum.RealizedPnL},
		{"Unrealized P&L", sum.UnrealizedPnL},
		{"Total Fees", sum.TotalFees},
		{"Total Income", sum.TotalIncome},
	}
	for i, row := range perfRows {
		setClientCells(f, sh4, i+2, row)
		_ = f.SetCellStyle(sh4, clientCell(1, i+2), clientCell(1, i+2), labelStyle)
	}

	// ── Write to bytes ────────────────────────────────────────────────────────
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, "", fmt.Errorf("portfolio: excel write: %w", err)
	}

	// Sanitize account number for filename (replace / with _)
	safeAccNum := strings.ReplaceAll(acc.AccountNumber, "/", "_")
	filename := fmt.Sprintf("client_statement_%s_%s_%s.xlsx",
		safeAccNum,
		from.Format("2006-01-02"),
		to.Format("2006-01-02"),
	)

	return buf.Bytes(), filename, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// setClientCells writes a row of values starting at column 1 for the given sheet and row.
func setClientCells(f *excelize.File, sheet string, row int, vals []interface{}) {
	for col, v := range vals {
		cell, _ := excelize.CoordinatesToCellName(col+1, row)
		_ = f.SetCellValue(sheet, cell, v)
	}
}

// clientCell returns the Excel cell name for (col, row) — 1-indexed.
func clientCell(col, row int) string {
	name, _ := excelize.CoordinatesToCellName(col, row)
	return name
}
