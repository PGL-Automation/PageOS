package notification

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InApp is a notification destined for a specific user's in-app inbox.
type InApp struct {
	Type       string    // e.g. "onboarding_approved"
	Title      string
	Body       string
	Link       string // optional: frontend route
	Priority   string // low | medium | high | urgent  (defaults to "medium")
	EntityType string // optional context: "case", "journal", "contact", …
	EntityID   *uuid.UUID
}

func (n *InApp) priority() string {
	if n.Priority == "" {
		return "medium"
	}
	return n.Priority
}

// Send writes one in-app notification for userID.  db may be a *pgxpool.Pool
// or a pgx.Tx — both implement the query interface we need.
func Send(ctx context.Context, db interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}, userID uuid.UUID, n InApp) error {
	var entityID *uuid.UUID
	if n.EntityID != nil && *n.EntityID != uuid.Nil {
		entityID = n.EntityID
	}
	err := db.QueryRow(ctx, `
		INSERT INTO notification.in_app
			(user_id, type, title, body, link, priority, entity_type, entity_id, created_date)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CURRENT_DATE)
		ON CONFLICT (user_id, type, entity_id, created_date)
		    DO NOTHING
		RETURNING id`,
		userID, n.Type, n.Title, n.Body,
		nullStr(n.Link), n.priority(), nullStr(n.EntityType), entityID,
	).Scan(new(uuid.UUID))
	if err != nil && err.Error() == "no rows in result set" {
		return nil // duplicate suppressed by de-dup index — not an error
	}
	return err
}

// SendTx is like Send but accepts an explicit pgx.Tx so the insert is
// part of the caller's business transaction.
func SendTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID, n InApp) error {
	return Send(ctx, tx, userID, n)
}

// SendToRole fetches all active users holding any of the given position codes
// in the given subsidiary (uuid.Nil = all subsidiaries) and sends each one
// an in-app notification.
func SendToRole(ctx context.Context, pool *pgxpool.Pool, subsidiaryID uuid.UUID, codes []string, n InApp) error {
	var rows []uuid.UUID
	var err error

	if subsidiaryID == uuid.Nil {
		rows, err = usersWithRoleAny(ctx, pool, codes)
	} else {
		rows, err = usersWithRoleInSub(ctx, pool, subsidiaryID, codes)
	}
	if err != nil {
		return fmt.Errorf("SendToRole query: %w", err)
	}
	for _, uid := range rows {
		_ = Send(ctx, pool, uid, n) // best-effort; don't abort on single failure
	}
	return nil
}

// SendToUser resolves a person_id → user_id and sends a notification.
// If the person has no login account (user_id NULL) this is a no-op.
func SendToUser(ctx context.Context, pool *pgxpool.Pool, personID uuid.UUID, n InApp) error {
	var userID uuid.UUID
	err := pool.QueryRow(ctx,
		`SELECT user_id FROM organization.person WHERE id = $1 AND user_id IS NOT NULL`,
		personID,
	).Scan(&userID)
	if err != nil {
		return nil // person has no account — nothing to do
	}
	return Send(ctx, pool, userID, n)
}

// SendToUserByID is an alias for Send that accepts the identity.users.id directly.
func SendToUserByID(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, n InApp) error {
	return Send(ctx, pool, userID, n)
}

// ── list / mark-read helpers used by the HTTP handler ────────────────────────

// InAppRow is what the API returns for each notification.
type InAppRow struct {
	ID         uuid.UUID  `json:"id"`
	Type       string     `json:"type"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	Link       *string    `json:"link,omitempty"`
	Priority   string     `json:"priority"`
	IsRead     bool       `json:"is_read"`
	CreatedAt  time.Time  `json:"created_at"`
	EntityType *string    `json:"entity_type,omitempty"`
	EntityID   *uuid.UUID `json:"entity_id,omitempty"`
}

// List returns up to limit recent notifications for the user (both read and unread).
func List(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, limit int) ([]InAppRow, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
		SELECT id, type, title, body, link, priority, is_read, created_at, entity_type, entity_id
		FROM notification.in_app
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var result []InAppRow
	for rows.Next() {
		var r InAppRow
		if err := rows.Scan(&r.ID, &r.Type, &r.Title, &r.Body, &r.Link,
			&r.Priority, &r.IsRead, &r.CreatedAt, &r.EntityType, &r.EntityID); err != nil {
			return nil, 0, err
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var unread int
	_ = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM notification.in_app WHERE user_id=$1 AND NOT is_read`, userID,
	).Scan(&unread)

	return result, unread, nil
}

// MarkRead marks one notification as read.
func MarkRead(ctx context.Context, pool *pgxpool.Pool, id, userID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		UPDATE notification.in_app
		SET is_read=true, read_at=now()
		WHERE id=$1 AND user_id=$2`, id, userID)
	return err
}

// MarkAllRead marks all of a user's notifications as read.
func MarkAllRead(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		UPDATE notification.in_app
		SET is_read=true, read_at=now()
		WHERE user_id=$1 AND NOT is_read`, userID)
	return err
}

// UnreadCount returns the count of unread notifications for a user.
func UnreadCount(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (int, error) {
	var n int
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM notification.in_app WHERE user_id=$1 AND NOT is_read`, userID,
	).Scan(&n)
	return n, err
}

// SendToPosition notifies all active users who currently hold a specific
// position (by UUID), regardless of subsidiary.
func SendToPosition(ctx context.Context, pool *pgxpool.Pool, positionID uuid.UUID, n InApp) error {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT p.user_id
		FROM organization.assignment a
		JOIN organization.person p ON p.id = a.person_id
		WHERE a.position_id = $1
		  AND p.user_id IS NOT NULL
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)`,
		positionID)
	if err != nil {
		return fmt.Errorf("SendToPosition query: %w", err)
	}
	defer rows.Close()
	userIDs, err := scanUUIDs(rows)
	if err != nil {
		return err
	}
	for _, uid := range userIDs {
		_ = Send(ctx, pool, uid, n)
	}
	return nil
}

// ── internal helpers ─────────────────────────────────────────────────────────

func usersWithRoleAny(ctx context.Context, pool *pgxpool.Pool, codes []string) ([]uuid.UUID, error) {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT p.user_id
		FROM organization.assignment a
		JOIN organization.position  pos ON pos.id = a.position_id
		JOIN organization.person    p   ON p.id  = a.person_id
		WHERE pos.code = ANY($1::text[])
		  AND p.user_id IS NOT NULL
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)`,
		codes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanUUIDs(rows)
}

func usersWithRoleInSub(ctx context.Context, pool *pgxpool.Pool, subID uuid.UUID, codes []string) ([]uuid.UUID, error) {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT p.user_id
		FROM organization.assignment a
		JOIN organization.position  pos ON pos.id = a.position_id
		JOIN organization.person    p   ON p.id  = a.person_id
		WHERE pos.code = ANY($1::text[])
		  AND a.subsidiary_id = $2
		  AND p.user_id IS NOT NULL
		  AND a.effective_from <= CURRENT_DATE
		  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)`,
		codes, subID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanUUIDs(rows)
}

func scanUUIDs(rows pgx.Rows) ([]uuid.UUID, error) {
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
