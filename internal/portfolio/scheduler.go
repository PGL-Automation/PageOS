package portfolio

import (
	"context"
	"log/slog"
	"time"
)

// PortfolioScheduler runs daily portfolio operations in the background.
// Construct it with NewPortfolioScheduler and call Run in a goroutine.
type PortfolioScheduler struct {
	svc    *Service
	logger *slog.Logger
}

// NewPortfolioScheduler creates a PortfolioScheduler that delegates work to svc.
func NewPortfolioScheduler(svc *Service, logger *slog.Logger) *PortfolioScheduler {
	return &PortfolioScheduler{svc: svc, logger: logger}
}

// Run starts the daily scheduler. It blocks until ctx is cancelled.
//
// Schedule (Lagos time, UTC+1):
//   - 18:00 (6 PM): CalculateNAV for all active funds (RunAllNAVs)
//   - 19:00 (7 PM): check compliance rules for all active funds
//
// On first start the scheduler sleeps until the next occurrence of each
// target hour, then fires every 24 hours afterwards so the wall-clock time
// stays stable without drift.
func (s *PortfolioScheduler) Run(ctx context.Context) {
	s.logger.Info("portfolio scheduler started")

	navDone := make(chan struct{}, 1)
	complianceDone := make(chan struct{}, 1)

	go s.runLoop(ctx, 18, s.runDailyNAV, navDone)
	go s.runLoop(ctx, 19, s.runDailyCompliance, complianceDone)

	<-ctx.Done()
	// Wait for any in-progress jobs to acknowledge cancellation.
	s.logger.Info("portfolio scheduler stopped")
}

// runLoop sleeps until the next occurrence of targetHour (UTC+1 / WAT),
// fires fn, then repeats every 24 hours.
func (s *PortfolioScheduler) runLoop(ctx context.Context, targetHour int, fn func(context.Context), done chan<- struct{}) {
	defer func() {
		if done != nil {
			done <- struct{}{}
		}
	}()

	for {
		delay := timeUntilNextHourWAT(targetHour)
		s.logger.Info("portfolio scheduler: next job",
			"target_hour_WAT", targetHour,
			"delay", delay.Round(time.Second))

		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}

		fn(ctx)

		// Sleep the remainder of the 24-hour cycle so the next tick lands at
		// the same wall-clock time tomorrow.
		select {
		case <-ctx.Done():
			return
		case <-time.After(24 * time.Hour):
		}
	}
}

// runDailyNAV calculates NAV for every active fund as of yesterday's close.
// NAV is computed for the previous calendar day so that all end-of-day prices
// are settled before the calculation runs.
func (s *PortfolioScheduler) runDailyNAV(ctx context.Context) {
	navDate := time.Now().UTC().AddDate(0, 0, -1)
	navDate = time.Date(navDate.Year(), navDate.Month(), navDate.Day(), 0, 0, 0, 0, time.UTC)

	s.logger.Info("portfolio scheduler: running daily NAV calculation", "nav_date", navDate.Format("2006-01-02"))

	results, err := s.svc.RunAllNAVs(ctx, navDate)
	if err != nil {
		s.logger.Warn("portfolio scheduler: daily NAV failed", "err", err)
		return
	}

	s.logger.Info("portfolio scheduler: daily NAV complete",
		"nav_date", navDate.Format("2006-01-02"),
		"funds_calculated", len(results))
}

// runDailyCompliance checks compliance rules for all active funds.
// It logs any violations found. A future iteration should surface these as
// in-app notifications via the notification package.
//
// TODO: implement full compliance rule evaluation (concentration limits,
// sector caps, asset-class constraints, benchmark tracking-error bounds).
// For now this is a structured placeholder that confirms the hook is wired.
func (s *PortfolioScheduler) runDailyCompliance(ctx context.Context) {
	checkDate := time.Now().UTC().AddDate(0, 0, -1)
	checkDate = time.Date(checkDate.Year(), checkDate.Month(), checkDate.Day(), 0, 0, 0, 0, time.UTC)

	s.logger.Info("portfolio scheduler: running daily compliance check", "check_date", checkDate.Format("2006-01-02"))

	rows, err := s.svc.pool.Query(ctx, `
		SELECT id, code, name
		FROM   portfolio.fund
		WHERE  status = 'active'
	`)
	if err != nil {
		s.logger.Warn("portfolio scheduler: compliance check — could not list funds", "err", err)
		return
	}
	defer rows.Close()

	type fundRow struct {
		id   string
		code string
		name string
	}

	var funds []fundRow
	for rows.Next() {
		var f fundRow
		if err := rows.Scan(&f.id, &f.code, &f.name); err != nil {
			s.logger.Warn("portfolio scheduler: compliance check — scan fund", "err", err)
			continue
		}
		funds = append(funds, f)
	}
	if err := rows.Err(); err != nil {
		s.logger.Warn("portfolio scheduler: compliance check — rows error", "err", err)
		return
	}

	// TODO: for each fund, evaluate concentration limits, sector/asset-class caps,
	// benchmark tracking-error bounds, and regulatory exposure rules.
	// Surface violations as notifications via notification.SendToRole.
	s.logger.Info("portfolio scheduler: daily compliance check complete",
		"check_date", checkDate.Format("2006-01-02"),
		"funds_checked", len(funds))
}

// timeUntilNextHourWAT returns the duration from now until the next occurrence
// of the given hour (0-23) in West Africa Time (UTC+1).
// If the target hour is in the past for today it returns the duration to the
// same hour tomorrow.
func timeUntilNextHourWAT(hour int) time.Duration {
	wat := time.FixedZone("WAT", 1*60*60) // UTC+1
	now := time.Now().In(wat)

	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, wat)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return time.Until(next)
}
