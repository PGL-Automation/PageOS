-- +goose Up
-- Add narration to internal_transaction so the GL description from the
-- ledger export is stored and shown in the reconciliation match view
-- instead of the generic 'gl_export' type label.
ALTER TABLE reconciliation.internal_transaction
    ADD COLUMN IF NOT EXISTS narration text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE reconciliation.internal_transaction DROP COLUMN IF EXISTS narration;
