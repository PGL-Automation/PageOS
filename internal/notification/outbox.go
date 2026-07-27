// Package notification provides the transactional outbox and email delivery.
// Callers enqueue a message inside their business transaction; the background
// dispatcher delivers it. "At least once" — the sender must be idempotent.
package notification

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"

	notificationdb "github.com/pagegroup/pageos/internal/notification/store/gen"
)

// Message is a notification to be delivered.
type Message struct {
	EventType     string
	TargetAddress string // email address
	Subject       string
	BodyText      string
	Payload       map[string]any // arbitrary context stored for debugging
}

// Outbox enqueues notifications atomically inside a database transaction.
// Pass the pgx.Tx from your business operation so the enqueue is part of the
// same transaction — either both commit or neither does.
type Outbox struct{}

var sharedOutbox = &Outbox{}

// Shared returns the package-level outbox (stateless — no dependencies needed).
func Shared() *Outbox { return sharedOutbox }

// Enqueue writes one notification row inside tx. tx must be a pgx.Tx.
func (o *Outbox) Enqueue(ctx context.Context, tx pgx.Tx, msg Message) error {
	payload := []byte("{}")
	if msg.Payload != nil {
		if b, err := json.Marshal(msg.Payload); err == nil {
			payload = b
		}
	}
	q := notificationdb.New(tx)
	_, err := q.EnqueueNotification(ctx, notificationdb.EnqueueNotificationParams{
		EventType:     msg.EventType,
		TargetAddress: msg.TargetAddress,
		TargetType:    "email",
		Subject:       msg.Subject,
		BodyText:      msg.BodyText,
		Payload:       payload,
	})
	return err
}
