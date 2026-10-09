// cmd/seed_recon_providus seeds historical reconciliation data for
// Providus Bank – Client Account (NUBAN 5401732286) from the Excel files
// in files/.
//
// Usage (run from repo root):
//
//	PAGEOS_DATABASE_URL="postgres://..." go run ./cmd/seed_recon_providus
//
// What it does:
//  1. Reads the Providus bank statement Excel (full May–Sept 2026 period)
//  2. Reads the Providus GL ledger Excel
//  3. Creates one reconciliation run per calendar month (May–Sept 2026)
//  4. Auto-matches each run and prints the results
//
// Idempotent: months where a run already exists are skipped.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/audit"
	"github.com/pagegroup/pageos/internal/reconciliation"
)

const (
	providusNUBAN = "5401732286"

	// Paths relative to repo root.
	bankStmFile = "files/STATEMENT - 2026-09-30T135049.445 (1).xls"
	glLedgerFile = "files/Providus CLient_Ledger (1).xlsx"
)

func main() {
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

	// ── Resolve the Providus bank account ────────────────────────────────────
	var bankAccountID, subsidiaryID uuid.UUID
	err = pool.QueryRow(ctx, `
		SELECT id, subsidiary_id FROM reconciliation.bank_account
		WHERE account_number = $1 AND status = 'active'
		LIMIT 1
	`, providusNUBAN).Scan(&bankAccountID, &subsidiaryID)
	if err != nil {
		logger.Error("Providus bank account not found — run migrations first",
			"nuban", providusNUBAN, "err", err)
		os.Exit(1)
	}
	logger.Info("found Providus bank account", "id", bankAccountID, "subsidiary_id", subsidiaryID)

	// ── Resolve a system user ─────────────────────────────────────────────────
	var systemUserID uuid.UUID
	err = pool.QueryRow(ctx, `SELECT id FROM identity.users ORDER BY created_at LIMIT 1`).Scan(&systemUserID)
	if err != nil {
		logger.Error("no users found", "err", err)
		os.Exit(1)
	}
	logger.Info("using system user for audit", "id", systemUserID)

	// ── Build reconciliation service ──────────────────────────────────────────
	auditWriter := audit.NewWriter(pool)
	svc := reconciliation.NewService(pool, auditWriter)

	// ── Parse the full bank statement Excel ───────────────────────────────────
	logger.Info("parsing bank statement", "file", bankStmFile)
	stmLines, err := parseBankStatement(bankStmFile)
	if err != nil {
		logger.Error("parse bank statement", "err", err)
		os.Exit(1)
	}
	logger.Info("bank statement parsed", "total_lines", len(stmLines))

	// ── Parse the GL ledger Excel ─────────────────────────────────────────────
	logger.Info("parsing GL ledger", "file", glLedgerFile)
	glLines, err := parseGLLedger(glLedgerFile)
	if err != nil {
		logger.Error("parse GL ledger", "err", err)
		os.Exit(1)
	}
	logger.Info("GL ledger parsed", "total_lines", len(glLines))

	// ── Process one calendar month at a time ──────────────────────────────────
	months := []struct{ year, month int }{
		{2026, 5},
		{2026, 6},
		{2026, 7},
		{2026, 8},
		{2026, 9},
	}

	for _, m := range months {
		periodStart := time.Date(m.year, time.Month(m.month), 1, 0, 0, 0, 0, time.UTC)
		periodEnd := periodStart.AddDate(0, 1, -1)
		label := fmt.Sprintf("%d-%02d", m.year, m.month)
		log := logger.With("period", label)

		// Skip if a run already exists for this period.
		var existing int
		_ = pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM reconciliation.reconciliation_run
			WHERE bank_account_id = $1 AND period_start = $2 AND period_end = $3
		`, bankAccountID, periodStart, periodEnd).Scan(&existing)
		if existing > 0 {
			log.Info("run already exists — skipping")
			continue
		}

		// Filter lines for this month.
		monthStm := filterByMonth(stmLines, m.year, m.month)
		if len(monthStm) == 0 {
			log.Warn("no bank statement lines for this month — skipping")
			continue
		}
		log.Info("lines for period", "bank_lines", len(monthStm))

		openingBalance := computeOpening(stmLines, m.year, m.month)
		closingBalance := computeClosing(stmLines, m.year, m.month)
		log.Info("balances",
			"opening_NGN", fmt.Sprintf("%.2f", float64(openingBalance)/100),
			"closing_NGN", fmt.Sprintf("%.2f", float64(closingBalance)/100),
		)

		// Insert bank statement.
		stmResult, err := insertBankStatement(ctx, pool, bankAccountID, systemUserID,
			periodStart, periodEnd, openingBalance, closingBalance, monthStm)
		if err != nil {
			log.Error("insert bank statement", "err", err)
			continue
		}
		log.Info("bank statement inserted", "statement_id", stmResult.id, "lines", len(monthStm))

		// Insert GL internal transactions.
		monthGL := filterGLByMonth(glLines, m.year, m.month)
		log.Info("GL lines for period", "count", len(monthGL))
		if len(monthGL) > 0 {
			glCount, err := insertGLLines(ctx, pool, bankAccountID, subsidiaryID, monthGL)
			if err != nil {
				log.Error("insert GL lines", "err", err)
			} else {
				log.Info("GL lines inserted", "count", glCount)
			}
		}

		// Create reconciliation run.
		run, err := svc.CreateRun(ctx, bankAccountID, systemUserID, periodStart, periodEnd)
		if err != nil {
			log.Error("create run", "err", err)
			continue
		}
		log.Info("reconciliation run created", "run_id", run.ID)

		// Auto-match.
		_, err = svc.AutoMatch(ctx, run.ID, systemUserID)
		if err != nil {
			log.Error("auto-match", "err", err)
			continue
		}

		// Print summary.
		var matched, unmatchedBank, unmatchedInternal int64
		_ = pool.QueryRow(ctx, `
			SELECT
				COUNT(*) FILTER (WHERE status = 'matched')            AS matched,
				COUNT(*) FILTER (WHERE status = 'unmatched_bank')     AS unmatched_bank,
				COUNT(*) FILTER (WHERE status = 'unmatched_internal') AS unmatched_internal
			FROM reconciliation.reconciliation_match WHERE run_id = $1
		`, run.ID).Scan(&matched, &unmatchedBank, &unmatchedInternal)

		log.Info("run complete",
			"matched", matched,
			"unmatched_bank", unmatchedBank,
			"unmatched_internal", unmatchedInternal,
		)
	}

	logger.Info("seed complete — refresh the Reconciliation → Runs page")
}
