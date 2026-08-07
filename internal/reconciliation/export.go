package reconciliation

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// ExportRunExcel builds an Excel workbook with five sheets:
//   Summary | Credits: Bank not Ledger | Debits: Bank not Ledger |
//   Credits: Ledger not Bank | Debits: Ledger not Bank
func (s *Service) ExportRunExcel(ctx context.Context, runID uuid.UUID) (*excelize.File, string, error) {
	runRow, err := s.store.GetReconciliationRun(ctx, runID)
	if err != nil {
		return nil, "", fmt.Errorf("reconciliation: run not found: %w", err)
	}
	run := toRun(runRow)

	rows, err := s.store.GetRunFullView(ctx, runID)
	if err != nil {
		return nil, "", err
	}

	var creditBank, debitBank, creditLedger, debitLedger []FullMatchRow
	for _, r := range rows {
		switch r.Status {
		case "unmatched_bank":
			if r.BankCreditKobo > 0 {
				creditBank = append(creditBank, r)
			} else {
				debitBank = append(debitBank, r)
			}
		case "unmatched_internal":
			if r.LedgerDirection == "credit" {
				creditLedger = append(creditLedger, r)
			} else {
				debitLedger = append(debitLedger, r)
			}
		}
	}

	f := excelize.NewFile()
	_ = f.SetSheetName("Sheet1", "Summary")

	addBankSheet(f, "Credits: Bank not Ledger", creditBank, true)
	addBankSheet(f, "Debits: Bank not Ledger", debitBank, false)
	addLedgerSheet(f, "Credits: Ledger not Bank", creditLedger)
	addLedgerSheet(f, "Debits: Ledger not Bank", debitLedger)
	buildReconSummary(f, run, creditBank, debitBank, creditLedger, debitLedger)

	fname := fmt.Sprintf("recon_%s_to_%s.xlsx",
		run.PeriodStart.Format("2006-01-02"),
		run.PeriodEnd.Format("2006-01-02"))
	return f, fname, nil
}

func setReconCells(f *excelize.File, sheet string, row int, vals []interface{}) {
	for col, v := range vals {
		cell, _ := excelize.CoordinatesToCellName(col+1, row)
		_ = f.SetCellValue(sheet, cell, v)
	}
}

func addBankSheet(f *excelize.File, name string, rows []FullMatchRow, isCredit bool) {
	_, _ = f.NewSheet(name)
	amtHeader := "Debit (NGN)"
	if isCredit {
		amtHeader = "Credit (NGN)"
	}
	setReconCells(f, name, 1, []interface{}{"Date", "Reference", "Narration", amtHeader})
	for i, r := range rows {
		date := ""
		if r.BankDate != nil {
			date = *r.BankDate
		}
		var amt float64
		if isCredit {
			amt = float64(r.BankCreditKobo) / 100.0
		} else {
			amt = float64(r.BankDebitKobo) / 100.0
		}
		setReconCells(f, name, i+2, []interface{}{date, r.BankReference, r.BankNarration, amt})
	}
}

func addLedgerSheet(f *excelize.File, name string, rows []FullMatchRow) {
	_, _ = f.NewSheet(name)
	setReconCells(f, name, 1, []interface{}{"Date", "Reference", "Type", "Amount (NGN)"})
	for i, r := range rows {
		date := ""
		if r.LedgerDate != nil {
			date = *r.LedgerDate
		}
		amt := float64(r.LedgerAmountKobo) / 100.0
		setReconCells(f, name, i+2, []interface{}{date, r.LedgerReference, r.LedgerType, amt})
	}
}

func sumBankKobo(rows []FullMatchRow, credit bool) float64 {
	var total int64
	for _, r := range rows {
		if credit {
			total += r.BankCreditKobo
		} else {
			total += r.BankDebitKobo
		}
	}
	return float64(total) / 100.0
}

func sumLedgerKobo(rows []FullMatchRow) float64 {
	var total int64
	for _, r := range rows {
		total += r.LedgerAmountKobo
	}
	return float64(total) / 100.0
}

func buildReconSummary(f *excelize.File, run ReconciliationRun,
	creditBank, debitBank, creditLedger, debitLedger []FullMatchRow) {
	const sh = "Summary"
	setReconCells(f, sh, 1, []interface{}{"Reconciliation Export"})
	setReconCells(f, sh, 2, []interface{}{fmt.Sprintf("Period: %s to %s",
		run.PeriodStart.Format("2006-01-02"), run.PeriodEnd.Format("2006-01-02"))})
	setReconCells(f, sh, 4, []interface{}{"Category", "Count", "Total (NGN)"})
	type sr struct {
		label string
		count int
		total float64
	}
	for i, v := range []sr{
		{"Credits: Bank not in Ledger", len(creditBank), sumBankKobo(creditBank, true)},
		{"Debits: Bank not in Ledger", len(debitBank), sumBankKobo(debitBank, false)},
		{"Credits: Ledger not in Bank", len(creditLedger), sumLedgerKobo(creditLedger)},
		{"Debits: Ledger not in Bank", len(debitLedger), sumLedgerKobo(debitLedger)},
	} {
		setReconCells(f, sh, i+5, []interface{}{v.label, v.count, v.total})
	}
}
