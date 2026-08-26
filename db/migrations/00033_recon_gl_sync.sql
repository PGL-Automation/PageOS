-- +goose Up
-- Link each bank account to its chart-of-accounts code so the system
-- can derive internal transactions directly from posted finance journals.
ALTER TABLE reconciliation.bank_account
    ADD COLUMN gl_account_code text NOT NULL DEFAULT '';

-- Unique dedup guard: the same journal line can only be synced once per
-- bank account. related_type='journal_line', related_id=finance.journal_line.id
CREATE UNIQUE INDEX idx_internal_txn_source
    ON reconciliation.internal_transaction (bank_account_id, related_id)
    WHERE related_type = 'journal_line' AND related_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS reconciliation.idx_internal_txn_source;
ALTER TABLE reconciliation.bank_account DROP COLUMN IF EXISTS gl_account_code;
