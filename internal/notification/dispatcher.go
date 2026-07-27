package notification

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	notificationdb "github.com/pagegroup/pageos/internal/notification/store/gen"
)

const (
	dispatchBatchSize = 20
	dispatchInterval  = 5 * time.Second
)

// Dispatcher polls the outbox and delivers pending notifications. Run it in a
// goroutine; cancel the context to stop it cleanly.
type Dispatcher struct {
	db     *pgxpool.Pool
	sender EmailSender
	logger *slog.Logger
}

func NewDispatcher(db *pgxpool.Pool, sender EmailSender, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{db: db, sender: sender, logger: logger}
}

// Run polls until ctx is cancelled.
func (d *Dispatcher) Run(ctx context.Context) {
	d.logger.Info("notification dispatcher started")
	ticker := time.NewTicker(dispatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.logger.Info("notification dispatcher stopped")
			return
		case <-ticker.C:
			d.resetStuck(ctx)
			d.dispatch(ctx)
		}
	}
}

func (d *Dispatcher) dispatch(ctx context.Context) {
	q := notificationdb.New(d.db)

	rows, err := q.ClaimPending(ctx, dispatchBatchSize)
	if err != nil {
		d.logger.Error("claim pending notifications", "err", err)
		return
	}

	for _, row := range rows {
		err := d.sender.Send(row.TargetAddress, row.Subject, row.BodyText)
		if err != nil {
			d.logger.Warn("send notification failed", "id", row.ID, "err", err)
			_ = q.MarkFailed(ctx, notificationdb.MarkFailedParams{
				ID:        row.ID,
				LastError: ptrStr(err.Error()),
			})
			continue
		}
		if err := q.MarkSent(ctx, row.ID); err != nil {
			d.logger.Warn("mark notification sent failed", "id", row.ID, "err", err)
		}
	}
}

func (d *Dispatcher) resetStuck(ctx context.Context) {
	if err := notificationdb.New(d.db).ResetStuck(ctx); err != nil {
		d.logger.Warn("reset stuck notifications", "err", err)
	}
}

func ptrStr(s string) *string { return &s }
