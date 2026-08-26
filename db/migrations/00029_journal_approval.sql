-- +goose Up
-- Extend journal_header with full approval audit trail.
-- submit → pending_approval; approve → posted; reject → draft.

ALTER TABLE finance.journal_header
    ADD COLUMN submitted_by   uuid,
    ADD COLUMN submitted_at   timestamptz,
    ADD COLUMN approved_by    uuid,
    ADD COLUMN approved_at    timestamptz,
    ADD COLUMN rejected_by    uuid,
    ADD COLUMN rejected_at    timestamptz,
    ADD COLUMN rejection_note text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE finance.journal_header
    DROP COLUMN IF EXISTS submitted_by,
    DROP COLUMN IF EXISTS submitted_at,
    DROP COLUMN IF EXISTS approved_by,
    DROP COLUMN IF EXISTS approved_at,
    DROP COLUMN IF EXISTS rejected_by,
    DROP COLUMN IF EXISTS rejected_at,
    DROP COLUMN IF EXISTS rejection_note;
