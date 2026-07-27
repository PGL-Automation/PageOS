package reconciliation

import (
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// ── Bank statement parser ─────────────────────────────────────────────────────

// StatementParser converts an uploaded bank statement file (bank's view)
// into ParsedLines ready to be stored as bank_statement_line rows.
// Implementations: CSVParser (configurable column map).
// Future: ExcelStatementParser, PDFStatementParser, BankAPIParser.
type StatementParser interface {
	Parse(r io.Reader) ([]ParsedLine, error)
}

// ParsedLine is a single normalised row from a bank statement.
type ParsedLine struct {
	TxnDate     time.Time
	ValueDate   *time.Time
	DebitKobo   int64
	CreditKobo  int64
	BalanceKobo *int64
	Narration   string
	Reference   string
	Raw         string
}

// defaultColMap matches the Providus bank statement CSV export format.
// Column headers from the actual file:
//   Transaction Date, Actual Transaction Date, Transaction Details,
//   Value Date, Debit Amount, Credit Amount, Current Balance, DR/CR, DOC-NUM
var defaultColMap = map[string]string{
	"date":       "Transaction Date",
	"value_date": "Value Date",
	"debit":      "Debit Amount",
	"credit":     "Credit Amount",
	"balance":    "Current Balance",
	"narration":  "Transaction Details",
	"reference":  "DOC-NUM",
}

// CSVParser reads a bank CSV using a column map from the bank account record.
// ColMap maps canonical field names → actual column header names in the file.
type CSVParser struct {
	ColMap map[string]string
}

func (p *CSVParser) colMap() map[string]string {
	if len(p.ColMap) == 0 {
		return defaultColMap
	}
	return p.ColMap
}

func (p *CSVParser) Parse(r io.Reader) ([]ParsedLine, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	cr.LazyQuotes = true
	cr.FieldsPerRecord = -1 // allow variable column count

	// Skip any leading blank rows to find the actual header row.
	// The Providus bank statement CSV has one empty row before the headers.
	var headers []string
	for {
		row, err := cr.Read()
		if err == io.EOF {
			return nil, fmt.Errorf("reconciliation parser: no header row found in CSV")
		}
		if err != nil {
			return nil, fmt.Errorf("reconciliation parser: read header: %w", err)
		}
		nonBlank := false
		for _, cell := range row {
			if strings.TrimSpace(cell) != "" {
				nonBlank = true
				break
			}
		}
		if nonBlank {
			headers = row
			break
		}
	}

	headerIdx := make(map[string]int, len(headers))
	for i, h := range headers {
		headerIdx[strings.TrimSpace(h)] = i
	}

	cm := p.colMap()
	idx := func(key string) int {
		name, ok := cm[key]
		if !ok {
			return -1
		}
		i, ok := headerIdx[name]
		if !ok {
			return -1
		}
		return i
	}

	dateIdx := idx("date")
	if dateIdx < 0 {
		return nil, fmt.Errorf("reconciliation parser: date column %q not found in CSV headers", cm["date"])
	}
	valueDateIdx := idx("value_date")
	debitIdx := idx("debit")
	creditIdx := idx("credit")
	balanceIdx := idx("balance")
	narrationIdx := idx("narration")
	referenceIdx := idx("reference")

	var lines []ParsedLine
	for {
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reconciliation parser: read row: %w", err)
		}

		allBlank := true
		for _, cell := range row {
			if strings.TrimSpace(cell) != "" {
				allBlank = false
				break
			}
		}
		if allBlank {
			continue
		}

		cell := func(i int) string {
			if i < 0 || i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}

		txnDate, err := parseDate(cell(dateIdx))
		if err != nil {
			continue
		}

		pl := ParsedLine{
			TxnDate:    txnDate,
			DebitKobo:  parseAmount(cell(debitIdx)),
			CreditKobo: parseAmount(cell(creditIdx)),
			Narration:  cell(narrationIdx),
			Reference:  cell(referenceIdx),
			Raw:        strings.Join(row, ","),
		}

		if valueDateIdx >= 0 {
			if vd, err := parseDate(cell(valueDateIdx)); err == nil {
				pl.ValueDate = &vd
			}
		}
		if balanceIdx >= 0 {
			if b := parseAmount(cell(balanceIdx)); b != 0 {
				pl.BalanceKobo = &b
			}
		}

		lines = append(lines, pl)
	}
	return lines, nil
}

// ── GL ledger parser ──────────────────────────────────────────────────────────

// LedgerParser converts an uploaded GL (General Ledger) export into
// LedgerLines ready to be stored as internal_transaction rows.
// The GL is the company's own view of what happened; the bank statement is
// the bank's view. Reconciliation matches the two.
//
// Implementations: ProvidusGLParser (Excel, 9-column format).
// Future: SageExportParser, QuickBooksCSVParser, OracleGLParser, etc.
type LedgerParser interface {
	Parse(r io.Reader) ([]LedgerLine, error)
}

// LedgerLine is a single normalised row from a GL export.
// Direction is from the bank-account perspective:
//   - "credit" = money received into the bank account (GL debit entry)
//   - "debit"  = money paid out of the bank account  (GL credit entry)
//
// This mirrors the bank statement convention so the matcher can compare
// the two sides directly by amount + direction + date.
type LedgerLine struct {
	TxnDate     time.Time
	Direction   string // "credit" | "debit"
	AmountKobo  int64
	BalanceKobo *int64 // running balance, stored for reference/audit
	Description string
	Reference   string // Trans.No formatted as "TXN-<n>", or explicit reference
	BatchNo     string
	LedgerID    string
	Raw         string
}

// ProvidusGLParser reads the Page Asset Management GL export for a Providus
// bank account. The file is an Excel workbook (.xlsx) with a single sheet
// named "ledger-statement" and these 9 columns (row 1 = headers):
//
//	Ledger ID | Effective Date | Batch No | Trans.No | Transaction Description
//	Reference | Debit Amount | Credit Amount | Balance
//
// Accounting convention in this GL:
//   - Debit Amount ≠ 0 → money received into the bank account (inflow)
//   - Credit Amount ≠ 0 → money paid out of the bank account (outflow)
//
// Direction is flipped to the bank-statement convention on output so the
// ExactMatcher can compare both sides without extra logic.
type ProvidusGLParser struct{}

// column indices (0-based) — fixed layout, not configurable
const (
	glColLedgerID     = 0
	glColDate         = 1
	glColBatchNo      = 2
	glColTransNo      = 3
	glColDescription  = 4
	glColReference    = 5
	glColDebitAmount  = 6
	glColCreditAmount = 7
	glColBalance      = 8
)

func (ProvidusGLParser) Parse(r io.Reader) ([]LedgerLine, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("ledger parser: open workbook: %w", err)
	}
	defer f.Close()

	// Accept the first sheet regardless of its name.
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("ledger parser: workbook has no sheets")
	}
	sheet := sheets[0]

	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("ledger parser: read sheet %q: %w", sheet, err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("ledger parser: sheet has no data rows")
	}

	// Row 0 is the header — skip it but validate it.
	header := rows[0]
	if len(header) < 9 {
		return nil, fmt.Errorf("ledger parser: expected 9 header columns, got %d", len(header))
	}

	cell := func(row []string, col int) string {
		if col >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[col])
	}

	var lines []LedgerLine
	for rowIdx, row := range rows[1:] {
		if len(row) == 0 {
			continue
		}

		// Skip blank rows (all cells empty).
		allBlank := true
		for _, c := range row {
			if strings.TrimSpace(c) != "" {
				allBlank = false
				break
			}
		}
		if allBlank {
			continue
		}

		dateStr := cell(row, glColDate)
		if dateStr == "" {
			continue
		}
		txnDate, err := parseDateOrExcel(dateStr)
		if err != nil {
			// Skip rows where the date can't be parsed (totals/separator rows).
			continue
		}

		debit := parseFloat(cell(row, glColDebitAmount))
		credit := parseFloat(cell(row, glColCreditAmount))

		// Skip rows where both amounts are zero (e.g. memo lines).
		if debit == 0 && credit == 0 {
			continue
		}

		// Flip convention: GL debit (inflow) → bank credit; GL credit (outflow) → bank debit.
		var direction string
		var amountNaira float64
		if debit != 0 {
			direction = "credit" // money came IN to the bank account
			amountNaira = debit
		} else {
			direction = "debit" // money went OUT of the bank account
			amountNaira = credit
		}
		amountKobo := int64(math.Round(amountNaira * 100))

		// Build reference: prefer the explicit Reference column, fall back to "TXN-<transNo>".
		ref := cell(row, glColReference)
		transNo := cell(row, glColTransNo)
		if ref == "" && transNo != "" {
			ref = "TXN-" + transNo
		}

		balanceNaira := parseFloat(cell(row, glColBalance))
		balanceKobo := int64(math.Round(balanceNaira * 100))

		raw := strings.Join(row, ",")
		if len(raw) > 500 {
			raw = raw[:500]
		}

		lines = append(lines, LedgerLine{
			TxnDate:     txnDate,
			Direction:   direction,
			AmountKobo:  amountKobo,
			BalanceKobo: &balanceKobo,
			Description: cell(row, glColDescription),
			Reference:   ref,
			BatchNo:     cell(row, glColBatchNo),
			LedgerID:    cell(row, glColLedgerID),
			Raw:         fmt.Sprintf("row:%d,%s", rowIdx+2, raw),
		})
	}
	return lines, nil
}

// ── Excel bank statement parser ───────────────────────────────────────────────

// ExcelStatementParser reads a bank statement from an Excel workbook.
// It uses the same ColMap configuration as CSVParser, reading the first sheet.
// This lets any bank's Excel statement be parsed by configuring the column names
// on the bank account record — no code change needed per bank.
type ExcelStatementParser struct {
	ColMap map[string]string
}

func (p *ExcelStatementParser) colMap() map[string]string {
	if len(p.ColMap) == 0 {
		return defaultColMap
	}
	return p.ColMap
}

func (p *ExcelStatementParser) Parse(r io.Reader) ([]ParsedLine, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("excel statement parser: open workbook: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("excel statement parser: workbook has no sheets")
	}
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, fmt.Errorf("excel statement parser: read sheet: %w", err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("excel statement parser: no data rows found")
	}

	// Find the first non-blank row to use as the header row.
	headerRowIdx := -1
	for i, row := range rows {
		for _, cell := range row {
			if strings.TrimSpace(cell) != "" {
				headerRowIdx = i
				break
			}
		}
		if headerRowIdx >= 0 {
			break
		}
	}
	if headerRowIdx < 0 {
		return nil, fmt.Errorf("excel statement parser: all rows are blank")
	}

	// Map column headers to indices
	headerIdx := make(map[string]int, len(rows[headerRowIdx]))
	for i, h := range rows[headerRowIdx] {
		headerIdx[strings.TrimSpace(h)] = i
	}

	cm := p.colMap()
	idx := func(key string) int {
		name, ok := cm[key]
		if !ok {
			return -1
		}
		i, ok := headerIdx[name]
		if !ok {
			return -1
		}
		return i
	}

	dateIdx     := idx("date")
	if dateIdx < 0 {
		return nil, fmt.Errorf("excel statement parser: date column %q not found in sheet headers", cm["date"])
	}
	valueDateIdx := idx("value_date")
	debitIdx      := idx("debit")
	creditIdx     := idx("credit")
	balanceIdx    := idx("balance")
	narrationIdx  := idx("narration")
	referenceIdx  := idx("reference")

	cell := func(row []string, i int) string {
		if i < 0 || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	var lines []ParsedLine
	for _, row := range rows[headerRowIdx+1:] {
		allBlank := true
		for _, c := range row {
			if strings.TrimSpace(c) != "" {
				allBlank = false
				break
			}
		}
		if allBlank {
			continue
		}

		txnDate, err := parseDateOrExcel(cell(row, dateIdx))
		if err != nil {
			continue
		}

		pl := ParsedLine{
			TxnDate:    txnDate,
			DebitKobo:  parseAmount(cell(row, debitIdx)),
			CreditKobo: parseAmount(cell(row, creditIdx)),
			Narration:  cell(row, narrationIdx),
			Reference:  cell(row, referenceIdx),
			Raw:        strings.Join(row, ","),
		}
		if valueDateIdx >= 0 {
			if vd, err := parseDateOrExcel(cell(row, valueDateIdx)); err == nil {
				pl.ValueDate = &vd
			}
		}
		if balanceIdx >= 0 {
			if b := parseAmount(cell(row, balanceIdx)); b != 0 {
				pl.BalanceKobo = &b
			}
		}
		lines = append(lines, pl)
	}
	return lines, nil
}

// ── CSV GL ledger parser ──────────────────────────────────────────────────────

// CSVLedgerParser reads a GL export in CSV format using the same 9-column layout
// as ProvidusGLParser but from a comma-separated file instead of Excel.
// Expected columns (header row): Ledger ID, Effective Date, Batch No, Trans.No,
// Transaction Description, Reference, Debit Amount, Credit Amount, Balance
type CSVLedgerParser struct{}

func (CSVLedgerParser) Parse(r io.Reader) ([]LedgerLine, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	cr.LazyQuotes = true

	headers, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("csv ledger parser: read header: %w", err)
	}
	if len(headers) < 8 {
		return nil, fmt.Errorf("csv ledger parser: expected at least 8 columns, got %d", len(headers))
	}

	// Build header index (case-insensitive)
	hIdx := make(map[string]int, len(headers))
	for i, h := range headers {
		hIdx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	find := func(candidates ...string) int {
		for _, c := range candidates {
			if i, ok := hIdx[strings.ToLower(c)]; ok {
				return i
			}
		}
		return -1
	}

	dateIdx     := find("effective date", "date", "txn date", "transaction date")
	debitIdx    := find("debit amount", "debit")
	creditIdx   := find("credit amount", "credit")
	balanceIdx  := find("balance")
	descIdx     := find("transaction description", "description", "narration")
	refIdx      := find("reference", "ref")
	batchIdx    := find("batch no", "batch")
	transIdx    := find("trans.no", "trans no", "transaction no")
	ledgerIDIdx := find("ledger id", "ledger_id")

	if dateIdx < 0 {
		return nil, fmt.Errorf("csv ledger parser: date column not found (looked for 'Effective Date', 'Date')")
	}

	cell := func(row []string, i int) string {
		if i < 0 || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	var lines []LedgerLine
	rowNum := 1
	for {
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("csv ledger parser: row %d: %w", rowNum, err)
		}
		rowNum++

		allBlank := true
		for _, c := range row {
			if strings.TrimSpace(c) != "" {
				allBlank = false
				break
			}
		}
		if allBlank {
			continue
		}

		txnDate, err := parseDateOrExcel(cell(row, dateIdx))
		if err != nil {
			continue
		}

		debit  := parseFloat(cell(row, debitIdx))
		credit := parseFloat(cell(row, creditIdx))
		if debit == 0 && credit == 0 {
			continue
		}

		// Same convention as ProvidusGLParser: GL debit → bank credit, GL credit → bank debit
		var direction string
		var amountNaira float64
		if debit != 0 {
			direction   = "credit"
			amountNaira = debit
		} else {
			direction   = "debit"
			amountNaira = credit
		}

		ref     := cell(row, refIdx)
		transNo := cell(row, transIdx)
		if ref == "" && transNo != "" {
			ref = "TXN-" + transNo
		}

		balanceNaira := parseFloat(cell(row, balanceIdx))
		balanceKobo  := int64(math.Round(balanceNaira * 100))

		lines = append(lines, LedgerLine{
			TxnDate:     txnDate,
			Direction:   direction,
			AmountKobo:  int64(math.Round(amountNaira * 100)),
			BalanceKobo: &balanceKobo,
			Description: cell(row, descIdx),
			Reference:   ref,
			BatchNo:     cell(row, batchIdx),
			LedgerID:    cell(row, ledgerIDIdx),
			Raw:         fmt.Sprintf("row:%d,%s", rowNum, strings.Join(row, ",")),
		})
	}
	return lines, nil
}

// ── shared helpers ────────────────────────────────────────────────────────────

var dateFormats = []string{
	"02 Jan 2006",
	"2 Jan 2006",
	"02-Jan-2006",
	"02/01/2006",
	"01/02/2006",
	"2006-01-02",
	"02-01-2006",
	"January 2, 2006",
	"Jan 2, 2006",
	"1/2/2006",
	"2/1/2006",
}

// parseDateOrExcel handles both plain string dates and the numeric serial
// dates that excelize returns when a cell has a date format but is read as
// a raw value string (e.g. "46051" for 2026-01-01).
func parseDateOrExcel(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date")
	}
	// Try string formats first.
	if t, err := parseDate(s); err == nil {
		return t, nil
	}
	// Try Excel serial number (days since 1899-12-30).
	if serial, err := strconv.ParseFloat(s, 64); err == nil && serial > 1000 {
		t, err := excelize.ExcelDateToTime(serial, false)
		if err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised date format: %q", s)
}

func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date")
	}
	for _, layout := range dateFormats {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised date format: %q", s)
}

// parseAmount strips commas/spaces, parses as float, converts to integer kobo.
func parseAmount(s string) int64 {
	return int64(math.Round(parseFloat(s) * 100))
}

// parseFloat strips formatting and returns a float64 (Naira value).
func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" {
		return 0
	}
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, " ", "")
	neg := false
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		s = s[1 : len(s)-1]
		neg = true
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	if neg {
		f = -f
	}
	return f
}
