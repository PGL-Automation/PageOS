-- +goose Up
-- Transactional outbox for notifications. Every mutating capability that needs
-- to send an email enqueues a row here inside the same DB transaction as the
-- business mutation. A background dispatcher polls and delivers.
-- This guarantees "at least once" delivery — the dispatcher is idempotent.

CREATE TABLE notification.outbox (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     text        NOT NULL,    -- e.g. onboarding.case.submitted
    target_address text        NOT NULL,    -- email address
    target_type    text        NOT NULL DEFAULT 'email',
    subject        text        NOT NULL DEFAULT '',
    body_text      text        NOT NULL DEFAULT '',
    payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status         text        NOT NULL DEFAULT 'pending', -- pending|processing|sent|failed
    attempts       int         NOT NULL DEFAULT 0,
    last_error     text,
    claimed_at     timestamptz,
    sent_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_status_idx ON notification.outbox (status, created_at)
    WHERE status IN ('pending', 'failed');

-- +goose Down
DROP TABLE notification.outbox;
