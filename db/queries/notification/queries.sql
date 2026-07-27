-- name: EnqueueNotification :one
INSERT INTO notification.outbox (event_type, target_address, target_type, subject, body_text, payload)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- ClaimPending locks up to N pending rows for processing (SKIP LOCKED
-- means multiple dispatcher instances never collide).
-- name: ClaimPending :many
UPDATE notification.outbox
SET status = 'processing', claimed_at = now()
WHERE id IN (
    SELECT id FROM notification.outbox
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT $1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: MarkSent :exec
UPDATE notification.outbox
SET status = 'sent', sent_at = now()
WHERE id = $1;

-- name: MarkFailed :exec
UPDATE notification.outbox
SET status = 'failed', attempts = attempts + 1, last_error = $2
WHERE id = $1;

-- name: ResetStuck :exec
-- Reset rows that were claimed but never marked (process crashed mid-flight).
UPDATE notification.outbox
SET status = 'pending', claimed_at = NULL
WHERE status = 'processing'
  AND claimed_at < now() - interval '5 minutes';
