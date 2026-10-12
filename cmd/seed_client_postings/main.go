// cmd/seed_client_postings imports the Symplus client-side postings CSV
// into finance.client_posting and auto-links each row to the matching
// finance.client_account sub-account by fuzzy name matching.
//
// Usage (run from repo root on the VPS):
//
//	PAGEOS_DATABASE_URL="postgres://..." \
//	  go run ./cmd/seed_client_postings
package main

import (
	"context"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	csvPath := flag.String("file", "", "Absolute path to the client-side postings CSV (required)")
	flag.Parse()

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	if *csvPath == "" {
		logger.Error("provide -file=/absolute/path/to/csv")
		flag.Usage()
		os.Exit(1)
	}

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

	// ── Load client_account mapping (name → account_code) ────────────────────
	type clientAcct struct{ name, code string }
	acctRows, err := pool.Query(ctx, `SELECT client_name, account_code FROM finance.client_account WHERE is_active = true`)
	if err != nil {
		logger.Error("load client accounts", "err", err)
		os.Exit(1)
	}
	clientMap := make(map[string]string) // lowercase name → code
	for acctRows.Next() {
		var ca clientAcct
		_ = acctRows.Scan(&ca.name, &ca.code)
		clientMap[strings.ToLower(strings.TrimSpace(ca.name))] = ca.code
	}
	acctRows.Close()
	logger.Info("loaded client accounts", "count", len(clientMap))

	// ── Parse the CSV ─────────────────────────────────────────────────────────
	csvFile := *csvPath
	f, err := os.Open(csvFile)
	if err != nil {
		logger.Error("open csv", "file", csvFile, "err", err)
		os.Exit(1)
	}
	defer f.Close()

	cr := csv.NewReader(f)
	cr.LazyQuotes = true
	cr.TrimLeadingSpace = true

	// Read header row.
	header, err := cr.Read()
	if err != nil {
		logger.Error("read header", "err", err)
		os.Exit(1)
	}

	// Build column index map.
	colIdx := make(map[string]int)
	for i, h := range header {
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
		s = strings.ReplaceAll(s, ",", "")
		s = strings.TrimSpace(s)
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
		// Cover Nigerian day/month/year and ISO formats, with and without zero-padding.
		formats := []string{
			"02/01/2006", "2/1/2006", "01/02/2006", "1/2/2006",
			"02-01-2006", "2-1-2006",
			"2006-01-02", "2006/01/02",
			"02-Jan-2006", "2-Jan-2006",
			"January 2, 2006", "Jan 2, 2006",
		}
		for _, f := range formats {
			if t, err := time.Parse(f, s); err == nil {
				return pgtype.Date{Time: t, Valid: true}
			}
		}
		// Try Excel serial number (days since 1899-12-30).
		if serial, err := strconv.ParseFloat(s, 64); err == nil && serial > 1000 {
			base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
			t := base.Add(time.Duration(serial) * 24 * time.Hour)
			return pgtype.Date{Time: t, Valid: true}
		}
		return pgtype.Date{}
	}

	inserted := 0
	skipped := 0
	matched := 0
	firstErr := "" // capture first error for diagnosis

	for {
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			skipped++
			continue
		}

		customerName := col(row, "Customer Name")
		if customerName == "" {
			customerName = col(row, "NAMES") // fallback
		}
		if customerName == "" {
			skipped++
			continue
		}

		debit := parseAmount(col(row, "Debit Amount"))
		credit := parseAmount(col(row, "Credit Amount"))
		tranAmt := parseAmount(col(row, "Tran. Amount"))
		if tranAmt == 0 {
			tranAmt = math.Abs(debit) + math.Abs(credit)
		}

		reversed := strings.EqualFold(col(row, "Reversed ?"), "true") ||
			strings.EqualFold(col(row, "Reversed ?"), "yes") ||
			col(row, "Reversed ?") == "1"

		// Try to match customer name to a client_account code.
		var accountCode *string
		normName := strings.ToLower(strings.TrimSpace(customerName))
		if code, ok := clientMap[normName]; ok {
			accountCode = &code
			matched++
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO finance.client_posting
			    (symplus_client_id, symplus_account_id, account_description,
			     customer_name, nuban_no, business_date, effective_date,
			     tran_no, tran_desc, tran_ref, tran_source,
			     debit_amount, credit_amount, tran_amount, is_reversed,
			     batch_no, officer_name, book_of_account, account_code)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
			ON CONFLICT DO NOTHING
		`,
			col(row, "Client ID"),
			col(row, "Account ID."),
			col(row, "Account Description"),
			customerName,
			col(row, "NUBAN No."),
			parseDate(col(row, "Business Date")),
			parseDate(col(row, "Effective Date")),
			col(row, "Tran. No."),
			col(row, "Tran. Desc."),
			col(row, "Tran. Ref"),
			col(row, "Tran. Source"),
			debit, credit, tranAmt,
			reversed,
			col(row, "Btc No"),
			col(row, "Officer Name"),
			col(row, "Book of Account"),
			accountCode,
		)
		if err != nil {
			if firstErr == "" {
				firstErr = fmt.Sprintf("row error (customer=%s eff_date=%s): %v",
					customerName, col(row, "Effective Date"), err)
			}
			skipped++
			continue
		}
		inserted++
	}

	if firstErr != "" {
		logger.Warn("first insert error (sample)", "detail", firstErr)
	}
	logger.Info("seed complete",
		"inserted", inserted,
		"skipped", skipped,
		"matched_to_account", matched,
		"unmatched", inserted-matched,
	)
	fmt.Printf("\n✅ Client postings imported: %d rows, %d matched to sub-accounts\n", inserted, matched)
	fmt.Printf("   Run on VPS and check /finance/clients in the app.\n")
}
