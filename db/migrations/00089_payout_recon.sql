-- +goose Up
-- Extend reconciliation_match to support 3-way matching: bank statement ↔
-- GL/internal transaction ↔ payout approval instruction.
--
-- For transactions that originated from the payout system the instruction ID
-- appears in the bank narration (e.g. PAM-APR-2026-000123).  When the
-- reconciliation engine finds such a line it records the matching payout
-- request here and stores whether the amounts agreed.
--
-- New match_type values:
--   payout_3way           – bank line + GL entry + approval all reconcile
--   payout_no_approval    – bank line has instruction ID but no approval record
--   payout_amount_mismatch – approval exists but bank amount ≠ approved amount

ALTER TABLE reconciliation.reconciliation_match
    ADD COLUMN IF NOT EXISTS payout_request_id  uuid,          -- payout.payment_request.id
    ADD COLUMN IF NOT EXISTS payout_instruction_id text,        -- e.g. PAM-APR-2026-000123
    ADD COLUMN IF NOT EXISTS payout_approved_kobo  bigint,      -- amount approved
    ADD COLUMN IF NOT EXISTS payout_bank_kobo       bigint;     -- amount on bank statement

CREATE INDEX IF NOT EXISTS recon_match_payout_idx
    ON reconciliation.reconciliation_match (payout_request_id)
    WHERE payout_request_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS reconciliation.recon_match_payout_idx;
ALTER TABLE reconciliation.reconciliation_match
    DROP COLUMN IF EXISTS payout_bank_kobo,
    DROP COLUMN IF EXISTS payout_approved_kobo,
    DROP COLUMN IF EXISTS payout_instruction_id,
    DROP COLUMN IF EXISTS payout_request_id;
