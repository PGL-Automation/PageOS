-- +goose Up
-- Two-person sign-off workflow for reconciliation runs.
-- Posting-type classification for bank-not-in-GL items.

-- ── Sign-off fields on reconciliation_run ────────────────────────────────────
ALTER TABLE reconciliation.reconciliation_run
    ADD COLUMN IF NOT EXISTS submitted_by    uuid,
    ADD COLUMN IF NOT EXISTS submitted_at    timestamptz,
    ADD COLUMN IF NOT EXISTS review_status   text,   -- NULL | pending | approved | rejected
    ADD COLUMN IF NOT EXISTS reviewed_by     uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz,
    ADD COLUMN IF NOT EXISTS reviewer_notes  text NOT NULL DEFAULT '';

-- ── Posting classification on reconciliation_match ────────────────────────────
-- Populated when staff classify a bank-not-in-GL item before posting it
-- as a journal entry in the finance module.
ALTER TABLE reconciliation.reconciliation_match
    ADD COLUMN IF NOT EXISTS posting_type  text,   -- see reconciliation.posting_type
    ADD COLUMN IF NOT EXISTS dr_gl_code    text,   -- debit leg GL code
    ADD COLUMN IF NOT EXISTS cr_gl_code    text,   -- credit leg GL code
    ADD COLUMN IF NOT EXISTS journal_id    uuid;   -- finance.journal_header.id once posted

-- +goose Down
ALTER TABLE reconciliation.reconciliation_match
    DROP COLUMN IF EXISTS journal_id,
    DROP COLUMN IF EXISTS cr_gl_code,
    DROP COLUMN IF EXISTS dr_gl_code,
    DROP COLUMN IF EXISTS posting_type;

ALTER TABLE reconciliation.reconciliation_run
    DROP COLUMN IF EXISTS reviewer_notes,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS review_status,
    DROP COLUMN IF EXISTS submitted_at,
    DROP COLUMN IF EXISTS submitted_by;
