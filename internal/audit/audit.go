// Package audit provides the append-only audit log that every mutating
// capability writes to. It is intentionally tiny and infrastructure-level:
// a single INSERT via pgx, no domain logic.
package audit

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Actor identifies who performed an action.
type Actor struct {
	Type string // user | agent | system
	ID   string
}

// Entry is one auditable event.
type Entry struct {
	Actor        Actor
	Action       string // dotted capability name, e.g. "identity.user.registered"
	ResourceType string
	ResourceID   string
	RequestID    string
	Context      map[string]any
}

// Writer appends entries to the audit log.
type Writer struct {
	db *pgxpool.Pool
}

func NewWriter(db *pgxpool.Pool) *Writer {
	return &Writer{db: db}
}

// Write persists one audit entry. Callers should not fail their operation if
// auditing errors, but they must log it — auditing gaps are a red flag.
func (w *Writer) Write(ctx context.Context, e Entry) error {
	ctxJSON := []byte("{}")
	if e.Context != nil {
		if b, err := json.Marshal(e.Context); err == nil {
			ctxJSON = b
		}
	}
	_, err := w.db.Exec(ctx,
		`INSERT INTO audit.audit_log
		    (actor_type, actor_id, action, resource_type, resource_id, request_id, context)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		e.Actor.Type, e.Actor.ID, e.Action, e.ResourceType, e.ResourceID, e.RequestID, ctxJSON,
	)
	return err
}
