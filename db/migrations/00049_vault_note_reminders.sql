-- +goose Up
-- Allow users to set a reminder date/time on vault notes.
ALTER TABLE vault.note
    ADD COLUMN IF NOT EXISTS notify_at  timestamptz,
    ADD COLUMN IF NOT EXISTS notified   boolean     NOT NULL DEFAULT false;

-- Index so the scheduler can cheaply find pending reminders.
CREATE INDEX idx_vault_note_remind
    ON vault.note (notify_at)
    WHERE notify_at IS NOT NULL AND NOT notified;

-- +goose Down
DROP INDEX IF EXISTS idx_vault_note_remind;
ALTER TABLE vault.note
    DROP COLUMN IF EXISTS notify_at,
    DROP COLUMN IF EXISTS notified;
