package reconciliation

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// ReconScheduler runs automated daily reconciliation pulls in the background.
// Construct it with NewReconScheduler and call Run in a goroutine.
type ReconScheduler struct {
	svc     *Service
	monoKey string
	logger  *slog.Logger
}

// NewReconScheduler creates a ReconScheduler.
//
//   - svc is the reconciliation Service used to pull statements and create runs.
//   - monoKey is the Mono secret key used to authenticate API calls.
func NewReconScheduler(svc *Service, monoKey string, logger *slog.Logger) *ReconScheduler {
	return &ReconScheduler{svc: svc, monoKey: monoKey, logger: logger}
}

// Run starts the daily reconciliation scheduler. It blocks until ctx is
// cancelled and should be called in a dedicated goroutine.
//
// Schedule (Lagos time, UTC+1):
//   - 06:00 (6 AM): for each active bank_connectivity record with
//     provider = 'mono', call PullStatementFromMono for yesterday's date.
//
// On first start the scheduler sleeps until the next 06:00 WAT occurrence,
// then fires every 24 hours so the wall-clock time stays stable.
func (s *ReconScheduler) Run(ctx context.Context) {
	s.logger.Info("reconciliation scheduler started")

	for {
		delay := timeUntilHourWAT(6)
		s.logger.Info("reconciliation scheduler: next pull",
			"target_hour_WAT", 6,
			"delay", delay.Round(time.Second))

		select {
		case <-ctx.Done():
			s.logger.Info("reconciliation scheduler stopped")
			return
		case <-time.After(delay):
		}

		s.runDailyPull(ctx)

		// Sleep the remainder of the 24-hour window so the next tick lands at
		// the same wall-clock time tomorrow.
		select {
		case <-ctx.Done():
			s.logger.Info("reconciliation scheduler stopped")
			return
		case <-time.After(24 * time.Hour):
		}
	}
}

// runDailyPull fetches yesterday's transactions from Mono for every active
// bank_connectivity record configured with provider = 'mono'.
func (s *ReconScheduler) runDailyPull(ctx context.Context) {
	yesterday := time.Now().UTC().AddDate(0, 0, -1)
	yesterday = time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, time.UTC)

	s.logger.Info("reconciliation scheduler: running daily reconciliation pull for all active bank accounts",
		"for_date", yesterday.Format("2006-01-02"))

	// Load all active Mono connectivity records.
	type connRow struct {
		bankAccountID    string
		providerAccountID string
	}

	rows, err := s.svc.store.Pool().Query(ctx, `
		SELECT bc.bank_account_id, bc.provider_account_id
		FROM   reconciliation.bank_connectivity bc
		WHERE  bc.is_active   = true
		  AND  bc.provider    = 'mono'
	`)
	if err != nil {
		s.logger.Warn("reconciliation scheduler: failed to list active Mono connectivity records", "err", err)
		return
	}
	defer rows.Close()

	var conns []connRow
	for rows.Next() {
		var c connRow
		if err := rows.Scan(&c.bankAccountID, &c.providerAccountID); err != nil {
			s.logger.Warn("reconciliation scheduler: scan connectivity row", "err", err)
			continue
		}
		conns = append(conns, c)
	}
	if err := rows.Err(); err != nil {
		s.logger.Warn("reconciliation scheduler: connectivity rows error", "err", err)
		return
	}

	s.logger.Info("reconciliation scheduler: pulling statements",
		"for_date", yesterday.Format("2006-01-02"),
		"account_count", len(conns))

	monoClient := NewMonoClient(s.monoKey)

	succeeded := 0
	failed := 0
	for _, c := range conns {
		bankAccountID, err := uuid.Parse(c.bankAccountID)
		if err != nil {
			s.logger.Warn("reconciliation scheduler: invalid bank_account_id",
				"value", c.bankAccountID, "err", err)
			failed++
			continue
		}

		runID, err := s.svc.PullStatementFromMono(ctx, bankAccountID, monoClient, yesterday)
		if err != nil {
			s.logger.Warn("reconciliation scheduler: pull failed",
				"bank_account_id", c.bankAccountID,
				"provider_account_id", c.providerAccountID,
				"for_date", yesterday.Format("2006-01-02"),
				"err", err)
			failed++
			continue
		}

		s.logger.Info("reconciliation scheduler: pull succeeded",
			"bank_account_id", c.bankAccountID,
			"for_date", yesterday.Format("2006-01-02"),
			"run_id", runID)
		succeeded++

		// Attempt to auto-close the run if everything matched via SmartMatcher.
		if runID != uuid.Nil {
			closed, closeErr := s.svc.TryAutoClose(ctx, runID)
			if closeErr != nil {
				s.logger.Warn("reconciliation scheduler: auto-close failed",
					"run_id", runID,
					"bank_account_id", c.bankAccountID,
					"err", closeErr)
			} else if closed {
				s.logger.Info("reconciliation scheduler: run auto-closed",
					"run_id", runID,
					"bank_account_id", c.bankAccountID)
			} else {
				s.logger.Info("reconciliation scheduler: run has unmatched items, left open for review",
					"run_id", runID,
					"bank_account_id", c.bankAccountID)
			}
		}
	}

	s.logger.Info("reconciliation scheduler: daily pull complete",
		"for_date", yesterday.Format("2006-01-02"),
		"succeeded", succeeded,
		"failed", failed)
}

// timeUntilHourWAT returns the duration from now until the next occurrence of
// the given hour (0-23) in West Africa Time (UTC+1). If the target hour has
// already passed for today it returns the duration to the same hour tomorrow.
func timeUntilHourWAT(hour int) time.Duration {
	wat := time.FixedZone("WAT", 1*60*60) // UTC+1
	now := time.Now().In(wat)

	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, wat)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return time.Until(next)
}

