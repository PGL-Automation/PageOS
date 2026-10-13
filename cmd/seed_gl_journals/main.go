// cmd/seed_gl_journals imports the Symplus GL detail export into:
//  1. finance.client_posting (rows with a Customer Name)
//  2. finance.journal_header + finance.journal_line (ALL rows, grouped by Batch No.)
//
// This populates Finance → Client Ledger and Finance → General Ledger
// with complete historical data from the Symplus GL export.
//
// Usage:
//
//	PAGEOS_DATABASE_URL="postgres://..." \
//	  go run ./cmd/seed_gl_journals \
//	  -file="/opt/pageos/files/GL detail _Historical Transactions Enquiry.xlsx" \
//	  -subsidiary="Page Asset Management Limited"
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

// Known Symplus GL code → PageOS finance.account code mappings.
var symlpusToPageOS = map[string]string{
	"GL0811101500": "1123", // Providus Bank – Client
	"GL0611101500": "1123", // same, alternate prefix
	"GL0811101600": "1114", // Providus Bank – Operations
	"GL0611101600": "1114",
	"GL0811101900": "1113", // Providus Bank – Main
	"GL0611101900": "1113",
	"GL0811100600": "1110", // GTBank – Main
	"GL0611100600": "1110",
	"GL0811100700": "1111", // GTBank – Operations
	"GL0611100700": "1111",
	"GL0811101700": "1112", // FSDH Bank – Main
	"GL0611101700": "1112",
	"GL0811102000": "1122", // FSDH Bank – Clients
	"GL0611102000": "1122",
	"GL0811101100": "1121", // Access Bank – Client
	"GL0611101100": "1121",
	"GL0811100100": "1126", // Stanbic – Client
	"GL0611100100": "1126",
	"GL0811101300": "1136", // UBA Nominee NGN
	"GL0611101300": "1136",
	"GL0811100800": "1127", // UBA Client
	"GL0611100800": "1127",
	"GL0811101400": "1135", // RMB Nominee NGN
	"GL0611101400": "1135",
	"GL0811102100": "1128", // Wema – Clients
	"GL0611102100": "1128",
	"GL0811100300": "1129", // Zenith – Client
	"GL0611100300": "1129",
	"GL0825000100": "2110", // Customer Deposits Control
	"GL0625000100": "2110",
	"GL0823100100": "2116", // Customer Cash Liabilities – Fund I
	"GL0821201400": "2115", // Interest Expense Payable – Fund I
	"GL0821201200": "2123", // Income Tax Payable
	"GL0821200600": "2121", // VAT Payable
	"GL0821201100": "2122", // WHT Payable
	"GL0821201000": "2190", // Other Payables
	"GL0821100600": "2103", // Accrued Audit Fees
	"GL0852000400": "5700", // Bank Charges
	"GL0652000400": "5700",
	"GL0852001500": "5301", // Business Development
	"GL0852001300": "5300", // Advertising
	"GL0852000100": "5400", // Audit Fee
	"GL0852000600": "5401", // Legal Fees
	"GL0852000700": "5410", // Professional Fees – Taxation
	"GL0852004300": "5001", // Salaries and Wages
	"GL0852003700": "5009", // Pension – Employee
	"GL0852003800": "5003", // Pension – Employer
	"GL0852002200": "5006", // Training
	"GL0852003400": "5005", // Medicals
	"GL0852004100": "5100", // Rent
	"GL0852002500": "5102", // Electricity
	"GL0852004600": "5202", // Telephone
	"GL0852003500": "5503", // Motor Vehicle Expenses
	"GL0852001900": "5600", // Depreciation – Computer
	"GL0852002000": "5601", // Depreciation – Furniture
	"GL0852001800": "5603", // Depreciation – Motor Vehicle
	"GL0852006400": "5604", // Amortisation – Software
	"GL0843000300": "4001", // Management Fee Income
	"GL0641000500": "4021", // Interest Income on CP
	"GL0641000400": "4010", // Interest Income on T-Bill
	"GL0641000100": "4020", // Interest Income on Fixed Placement
	"GL0841000500": "4021",
	"GL0841000400": "4010",
	"GL0841000100": "4020",
	"GL0842000100": "4011", // Dividend Income
	"GL0830000100": "3001", // Share Capital
	"GL0831000600": "3003", // Retained Earnings
	"GL0812100100": "1202", // Fixed Placement
	"GL0812100300": "1210", // ST Fixed Placement
	"GL0812200100": "1203", // Treasury Bills
	"GL0812300100": "1219", // Commercial Paper
}

func mapAccount(symlpusCode string) string {
	if code, ok := symlpusToPageOS[symlpusCode]; ok {
		return code
	}
	// Use the Symplus code directly as PageOS code (will be created if missing)
	return symlpusCode
}

func main() {
	filePath := flag.String("file", "", "Path to GL Historical Transactions Excel (required)")
	subName  := flag.String("subsidiary", "Page Asset Management Limited", "Subsidiary name")
	flag.Parse()

	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "usage: -file=/path/to/file.xlsx")
		os.Exit(1)
	}

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	dbURL := os.Getenv("PAGEOS_DATABASE_URL")
	if dbURL == "" { logger.Error("PAGEOS_DATABASE_URL not set"); os.Exit(1) }

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil { logger.Error("db connect", "err", err); os.Exit(1) }
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil { logger.Error("db ping", "err", err); os.Exit(1) }
	logger.Info("connected")

	// Resolve subsidiary
	var subsidiaryID string
	_ = pool.QueryRow(ctx, `SELECT id::text FROM organization.subsidiary WHERE name = $1 LIMIT 1`, *subName).Scan(&subsidiaryID)
	if subsidiaryID == "" { logger.Warn("subsidiary not found, using NULL") }
	logger.Info("subsidiary", "id", subsidiaryID, "name", *subName)

	// Load client account map
	clientMap := make(map[string]string)
	rows, _ := pool.Query(ctx, `SELECT client_name, account_code FROM finance.client_account WHERE is_active = true`)
	for rows.Next() {
		var name, code string
		_ = rows.Scan(&name, &code)
		clientMap[strings.ToLower(strings.TrimSpace(name))] = code
	}
	rows.Close()
	logger.Info("loaded client accounts", "count", len(clientMap))

	// Load existing system user for created_by
	var systemUser string
	_ = pool.QueryRow(ctx, `SELECT id::text FROM identity.users ORDER BY created_at LIMIT 1`).Scan(&systemUser)

	// Open Excel
	f, err := excelize.OpenFile(*filePath)
	if err != nil { logger.Error("open excel", "err", err); os.Exit(1) }
	defer f.Close()

	sheets := f.GetSheetList()
	allRows, err := f.GetRows(sheets[0])
	if err != nil { logger.Error("read sheet", "err", err); os.Exit(1) }
	if len(allRows) < 2 { logger.Error("no data"); os.Exit(1) }

	// Column index
	colIdx := make(map[string]int)
	for i, h := range allRows[0] { colIdx[strings.TrimSpace(h)] = i }

	col := func(row []string, name string) string {
		i, ok := colIdx[name]
		if !ok || i >= len(row) { return "" }
		return strings.TrimSpace(row[i])
	}
	amt := func(s string) float64 {
		s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
		if s == "" || s == "-" { return 0 }
		v, _ := strconv.ParseFloat(s, 64)
		return v
	}
	parseDate := func(s string) pgtype.Date {
		s = strings.TrimSpace(s)
		for _, f := range []string{"2006-01-02","02/01/2006","2/1/2006","01/02/2006","02-Jan-2006","2-Jan-2006","02-Jan-06","2-Jan-06","Jan 2, 2006"} {
			if t, err := time.Parse(f, s); err == nil { return pgtype.Date{Time: t, Valid: true} }
		}
		if serial, err := strconv.ParseFloat(s, 64); err == nil && serial > 1000 {
			return pgtype.Date{Time: time.Date(1899,12,30,0,0,0,0,time.UTC).Add(time.Duration(serial)*24*time.Hour), Valid: true}
		}
		return pgtype.Date{}
	}
	_ = pgtype.Text{} // keep pgtype import used

	// ── Pass 1: ensure all GL account codes exist in finance.account ─────────
	acctsSeen := make(map[string]bool)
	for _, row := range allRows[1:] {
		syCode := col(row, "Ledger Account ID.")
		if syCode == "" { continue }
		pageCode := mapAccount(syCode)
		if acctsSeen[pageCode] { continue }
		acctsSeen[pageCode] = true
		name := col(row, "Ledger Description")
		if name == "" { name = syCode }
		_, _ = pool.Exec(ctx, `
			INSERT INTO finance.account (code, name, account_type, account_group, normal_balance, is_header)
			VALUES ($1, $2, 'ASSET', 'Imported', 'DR', false)
			ON CONFLICT (code) DO NOTHING
		`, pageCode, name)
	}
	logger.Info("account codes ensured", "count", len(acctsSeen))

	// ── Pass 2: group rows by Batch No → journal entries ─────────────────────
	type glRow struct {
		batchNo    string
		tranNo     string
		desc       string
		batchDesc  string
		effDate    pgtype.Date
		postDate   pgtype.Date
		acctCode   string
		acctName   string
		debit      float64
		credit     float64
		cust       string
		custAcct   string
		tranRef    string
		postedBy   string
		company    string
		currency   string
	}

	// Collect all rows
	var glRows []glRow
	for _, row := range allRows[1:] {
		syCode := col(row, "Ledger Account ID.")
		if syCode == "" { continue }
		glRows = append(glRows, glRow{
			batchNo:   col(row, "Batch No."),
			tranNo:    col(row, "Tran.No."),
			desc:      col(row, "Tran. Description"),
			batchDesc: col(row, "Batch Description"),
			effDate:   parseDate(col(row, "Effective Date")),
			postDate:  parseDate(col(row, "Date Posted")),
			acctCode:  mapAccount(syCode),
			acctName:  col(row, "Ledger Description"),
			debit:     amt(col(row, "Debit Amount")),
			credit:    amt(col(row, "Credit Amount")),
			cust:      col(row, "Customer Name"),
			custAcct:  col(row, "CustomerAccount ID."),
			tranRef:   col(row, "Trans. Reference"),
			postedBy:  col(row, "Posted By"),
			company:   col(row, "Company"),
			currency:  col(row, "Currency ID."),
		})
	}

	// Group by batch
	batches := make(map[string][]glRow)
	batchOrder := []string{}
	for _, r := range glRows {
		key := r.batchNo
		if key == "" { key = r.tranNo }
		if _, exists := batches[key]; !exists { batchOrder = append(batchOrder, key) }
		batches[key] = append(batches[key], r)
	}

	journalsCreated := 0
	linesCreated := 0
	journalsSkipped := 0

	for _, batchKey := range batchOrder {
		bRows := batches[batchKey]
		if len(bRows) == 0 { continue }

		// Check if this batch was already imported
		var existing int
		_ = pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM finance.journal_header WHERE reference = $1 AND type = 'gl_import'
		`, batchKey).Scan(&existing)
		if existing > 0 { journalsSkipped++; continue }

		first := bRows[0]
		desc := first.batchDesc
		if desc == "" { desc = first.desc }
		if desc == "" { desc = "GL Import – " + batchKey }

		dateStr := ""
		if first.effDate.Valid { dateStr = first.effDate.Time.Format("2006-01-02") }
		if dateStr == "" { dateStr = time.Now().Format("2006-01-02") }

		// Compute totals
		var totalDebit, totalCredit float64
		for _, r := range bRows { totalDebit += r.debit; totalCredit += r.credit }

		// Create journal header
		var journalID string
		var sidArg interface{}
		if subsidiaryID != "" {
			sidArg = subsidiaryID
		}
		err := pool.QueryRow(ctx, `
			INSERT INTO finance.journal_header
			    (subsidiary_id, reference, date, type, description, status,
			     debit_total, credit_total, line_count, created_by, created_by_name)
			VALUES (
			    $1::uuid, $2, $3::date, 'gl_import', $4, 'posted',
			    $5, $6, $7, $8::uuid, 'GL Import'
			)
			RETURNING id::text
		`,
			sidArg, batchKey, dateStr, desc,
			math.Round(totalDebit*100)/100, math.Round(totalCredit*100)/100, len(bRows),
			systemUser,
		).Scan(&journalID)
		if err != nil { continue }

		// Create journal lines
		for i, r := range bRows {
			narr := r.desc
			if narr == "" { narr = desc }
			_, _ = pool.Exec(ctx, `
				INSERT INTO finance.journal_line
				    (journal_id, line_number, account_code, account_name, narration, debit, credit)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`, journalID, i+1, r.acctCode, r.acctName, narr,
				math.Round(r.debit*100)/100, math.Round(r.credit*100)/100)
			linesCreated++
		}
		journalsCreated++
	}
	logger.Info("GL journals imported", "journals", journalsCreated, "lines", linesCreated, "skipped", journalsSkipped)

	// ── Pass 3: client postings (rows with Customer Name) ────────────────────
	clientInserted := 0
	clientSkipped := 0
	clientMatched := 0

	for _, r := range glRows {
		if r.cust == "" { clientSkipped++; continue }
		totalAmt := math.Abs(r.debit) + math.Abs(r.credit)
		if totalAmt == 0 { clientSkipped++; continue }

		var accountCode *string
		if code, ok := clientMap[strings.ToLower(strings.TrimSpace(r.cust))]; ok {
			accountCode = &code
			clientMatched++
		}

		_, err := pool.Exec(ctx, `
			INSERT INTO finance.client_posting
			    (symplus_client_id, symplus_account_id, account_description,
			     customer_name, nuban_no, business_date, effective_date,
			     tran_no, tran_desc, tran_ref, tran_source,
			     debit_amount, credit_amount, tran_amount, is_reversed,
			     batch_no, officer_name, book_of_account, account_code)
			VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'symplus_gl',
			        $10,$11,$12,false,$13,$14,$15,$16)
			ON CONFLICT DO NOTHING
		`,
			r.custAcct, r.custAcct, r.acctName,
			r.cust,
			r.effDate, r.effDate,
			r.tranNo, r.desc, r.tranRef,
			r.debit, r.credit, totalAmt,
			r.batchNo, r.postedBy, r.company,
			accountCode,
		)
		if err != nil { clientSkipped++; continue }
		clientInserted++
	}

	logger.Info("client postings imported",
		"inserted", clientInserted,
		"skipped", clientSkipped,
		"matched_to_account", clientMatched,
	)
	fmt.Printf("\n✅ GL Journals: %d created (%d lines)\n✅ Client Postings: %d imported, %d matched to sub-accounts\n",
		journalsCreated, linesCreated, clientInserted, clientMatched)
}
