-- +goose Up

-- In-app notification inbox per user.
-- Each row is one notification for one user; the frontend polls the REST API.
CREATE TABLE notification.in_app (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    type        text        NOT NULL,       -- e.g. 'onboarding_approved'
    title       text        NOT NULL,
    body        text        NOT NULL,
    link        text,                       -- optional: frontend route to navigate to
    priority    text        NOT NULL DEFAULT 'medium', -- low|medium|high|urgent
    is_read     boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    read_at     timestamptz,
    entity_type text,                       -- 'case'|'journal'|'contact'|'leave' etc.
    entity_id   uuid
);

-- Fast path: fetch unread for a user sorted newest-first.
CREATE INDEX idx_in_app_user_unread
    ON notification.in_app (user_id, created_at DESC)
    WHERE NOT is_read;

-- Full history fetch.
CREATE INDEX idx_in_app_user_all
    ON notification.in_app (user_id, created_at DESC);

-- De-dup guard: prevent the scheduler from inserting duplicate daily reminders
-- for the same user+type+entity on the same calendar day.
CREATE UNIQUE INDEX idx_in_app_daily_dedup
    ON notification.in_app (user_id, type, entity_id, (created_at::date))
    WHERE entity_id IS NOT NULL;

-- Birthday field on CRM contacts (needed for birthday reminders).
ALTER TABLE crm.contact
    ADD COLUMN IF NOT EXISTS date_of_birth date;

-- +goose Down
DROP INDEX IF EXISTS notification.idx_in_app_daily_dedup;
DROP INDEX IF EXISTS notification.idx_in_app_user_all;
DROP INDEX IF EXISTS notification.idx_in_app_user_unread;
DROP TABLE IF EXISTS notification.in_app;
ALTER TABLE crm.contact DROP COLUMN IF EXISTS date_of_birth;
