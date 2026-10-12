-- +goose Up
-- Client-side transaction postings imported from Symplus.
-- Stores the per-client transaction history for the client ledger view.

CREATE TABLE IF NOT EXISTS finance.client_posting (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Symplus identifiers (preserved for cross-reference)
    symplus_client_id text,
    symplus_account_id text,
    account_description text,
    -- Client identity
    customer_name    text        NOT NULL,
    nuban_no         text        NOT NULL DEFAULT '',
    -- Transaction details
    business_date    date,
    effective_date   date        NOT NULL,
    tran_no          text        NOT NULL DEFAULT '',
    tran_desc        text        NOT NULL DEFAULT '',
    tran_ref         text        NOT NULL DEFAULT '',
    tran_source      text        NOT NULL DEFAULT '',  -- AM | CH
    debit_amount     numeric(18,2) NOT NULL DEFAULT 0,
    credit_amount    numeric(18,2) NOT NULL DEFAULT 0,
    tran_amount      numeric(18,2) NOT NULL DEFAULT 0,
    is_reversed      boolean     NOT NULL DEFAULT false,
    batch_no         text        NOT NULL DEFAULT '',
    officer_name     text        NOT NULL DEFAULT '',
    book_of_account  text        NOT NULL DEFAULT '',
    -- Link to sub-account once matched
    account_code     text,       -- e.g. '2110-0042' — populated by a match job
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_customer_name_idx ON finance.client_posting (customer_name);
CREATE INDEX cp_effective_date_idx ON finance.client_posting (effective_date);
CREATE INDEX cp_account_code_idx ON finance.client_posting (account_code) WHERE account_code IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS finance.client_posting;
