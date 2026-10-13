// cmd/seed_client_postings_hist imports the Symplus Historical Data GL export
// (GL detail_Historical Transactions Enquiry format, 25 columns) into
// finance.client_posting, linking each row to a client sub-account.
//
// Usage:
//
//	PAGEOS_DATABASE_URL="postgres://..." \
//	  go run ./cmd/seed_client_postings_hist \
//	  -file="/opt/pageos/files/Historical Data_Jan 1 - Apr 30, 2026.xlsx"
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

func main() {
	filePath := flag.String("file", "", "Path to GL Historical Transactions Excel file (required)")
	flag.Parse()
	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "usage: -file=/path/to/Historical_Data.xlsx")
		os.Exit(1)
	}

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	dbURL := os.Getenv("PAGEOS_DATABASE_URL")
	if dbURL == "" {
		logger.Error("PAGEOS_DATABASE_URL not set")
		os.Exit(1)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		logger.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		logger.Error("db ping", "err", err)
		os.Exit(1)
	}
	logger.Info("connected to database")

	// Load client_account name → code mapping
	acctRows, err := pool.Query(ctx, `SELECT client_name, account_code FROM finance.client_account WHERE is_active = true`)
	if err != nil {
		logger.Error("load client accounts", "err", err)
		os.Exit(1)
	}
	clientMap := make(map[string]string)
	for acctRows.Next() {
		var name, code string
		_ = acctRows.Scan(&name, &code)
		clientMap[strings.ToLower(strings.TrimSpace(name))] = code
	}
	acctRows.Close()
	logger.Info("loaded client accounts", "count", len(clientMap))

	// Open Excel file
	f, err := excelize.OpenFile(*filePath)
	if err != nil {
		logger.Error("open excel", "err", err)
		os.Exit(1)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		logger.Error("no sheets found")
		os.Exit(1)
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		logger.Error("read sheet", "err", err)
		os.Exit(1)
	}
	if len(rows) < 2 {
		logger.Error("no data rows")
		os.Exit(1)
	}

	// Build column index from header
	colIdx := make(map[string]int)
	for i, h := range rows[0] {
		colIdx[strings.TrimSpace(h)] = i
	}

	col := func(row []string, name string) string {
		i, ok := colIdx[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	parseAmount := func(s string) float64 {
		s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
		if s == "" || s == "-" {
			return 0
		}
		v, _ := strconv.ParseFloat(s, 64)
		return v
	}

	parseDate := func(s string) pgtype.Date {
		s = strings.TrimSpace(s)
		if s == "" {
			return pgtype.Date{}
		}
		fmts := []string{
			"2006-01-02", "02/01/2006", "2/1/2006", "01/02/2006",
			"02-Jan-2006", "2-Jan-2006", "02-Jan-06", "2-Jan-06",
			"January 2, 2006", "Jan 2, 2006",
		}
		for _, f := range fmts {
			if t, err := time.Parse(f, s); err == nil {
				return pgtype.Date{Time: t, Valid: true}
			}
		}
		// Excel serial number
		if serial, err := strconv.ParseFloat(s, 64); err == nil && serial > 1000 {
			base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
			t := base.Add(time.Duration(serial) * 24 * time.Hour)
			return pgtype.Date{Time: t, Valid: true}
		}
		return pgtype.Date{}
	}

	inserted, skipped, matched := 0, 0, 0

	for _, row := range rows[1:] {
		customerName := col(row, "Customer Name")
		if customerName == "" {
			skipped++
			continue
		}

		debit := parseAmount(col(row, "Debit Amount"))
		credit := parseAmount(col(row, "Credit Amount"))
		tranAmt := math.Abs(debit) + math.Abs(credit)
		if tranAmt == 0 {
			skipped++
			continue
		}

		effectiveDate := parseDate(col(row, "Effective Date"))

		reversed := strings.EqualFold(col(row, "Reversed?"), "true") ||
			col(row, "Reversed?") == "1"

		var accountCode *string
		if code, ok := clientMap[strings.ToLower(strings.TrimSpace(customerName))]; ok {
			accountCode = &code
			matched++
		}

		tranDesc := col(row, "Tran. Description")
		tranRef := col(row, "Trans. Reference")
		tranNo := col(row, "Tran.No.")
		batchNo := col(row, "Batch No.")
		officer := col(row, "Posted By")
		clientID := col(row, "Customer ID")
		accountID := col(row, "CustomerAccount ID.")

		_, err = pool.Exec(ctx, `
			INSERT INTO finance.client_posting
			    (symplus_client_id, symplus_account_id, account_description,
			     customer_name, nuban_no, business_date, effective_date,
			     tran_no, tran_desc, tran_ref, tran_source,
			     debit_amount, credit_amount, tran_amount, is_reversed,
			     batch_no, officer_name, book_of_account, account_code)
			VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'symplus_gl',
			        $10,$11,$12,$13,$14,$15,'PAGE ASSET MANAGEMENT',$16)
			ON CONFLICT DO NOTHING
		`,
			clientID, accountID, col(row, "Ledger Description"),
			customerName,
			effectiveDate, effectiveDate,
			tranNo, tranDesc, tranRef,
			debit, credit, tranAmt,
			reversed,
			batchNo, officer,
			accountCode,
		)
		if err != nil {
			if inserted == 0 && skipped < 5 {
				logger.Warn("first insert error", "customer", customerName, "err", err)
			}
			skipped++
			continue
		}
		inserted++
	}

	logger.Info("seed complete",
		"inserted", inserted,
		"skipped", skipped,
		"matched_to_account", matched,
		"unmatched", inserted-matched,
	)
	fmt.Printf("\n✅ %d rows imported, %d matched to client sub-accounts\n", inserted, matched)
}
