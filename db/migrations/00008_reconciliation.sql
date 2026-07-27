-- +goose Up
-- Ensure the reconciliation schema exists (it was added to 00001 for fresh
-- installs; this CREATE IF NOT EXISTS handles already-migrated databases).
CREATE SCHEMA IF NOT EXISTS reconciliation;

-- Bank reconciliation infrastructure. All amounts are stored as integer
-- minor units (kobo for NGN) — never float. See docs §18.

CREATE TABLE reconciliation.bank_account (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id uuid NOT NULL,
    bank_name     text NOT NULL,
    account_number text NOT NULL,
    account_name  text NOT NULL,
    currency      text NOT NULL DEFAULT 'NGN',
    -- JSONB column-map for the statement parser: maps bank-specific CSV/Excel
    -- column names to canonical fields. Adding a new bank = new row, no code.
    -- e.g. {"date":"Date","debit":"Debit","credit":"Credit","narration":"Remarks","reference":"Ref"}
    parser_column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
    status        text NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation.bank_statement (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id uuid NOT NULL REFERENCES reconciliation.bank_account (id),
    document_id     uuid,           -- documents.document.id (nullable: parse-only import)
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    opening_balance bigint NOT NULL DEFAULT 0, -- kobo
    closing_balance bigint NOT NULL DEFAULT 0, -- kobo
    status          text NOT NULL DEFAULT 'imported', -- imported | reconciled
    imported_by     uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation.bank_statement_line (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id uuid NOT NULL REFERENCES reconciliation.bank_statement (id) ON DELETE CASCADE,
    txn_date     date NOT NULL,
    value_date   date,
    debit_kobo   bigint NOT NULL DEFAULT 0,
    credit_kobo  bigint NOT NULL DEFAULT 0,
    balance_kobo bigint,
    narration    text NOT NULL DEFAULT '',
    reference    text NOT NULL DEFAULT '',
    raw          text NOT NULL DEFAULT '', -- original CSV row, verbatim
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stmt_line_statement_idx ON reconciliation.bank_statement_line (statement_id);

-- PageOS's internal ledger of every money movement it recorded. Written by
-- financial capability approvals (investment receipt, liquidation payout, etc.)
CREATE TABLE reconciliation.internal_transaction (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id   uuid NOT NULL,
    bank_account_id uuid REFERENCES reconciliation.bank_account (id),
    type            text NOT NULL, -- investment_receipt|liquidation_payout|fee|interest|adjustment
    direction       text NOT NULL, -- credit | debit
    amount_kobo     bigint NOT NULL,
    currency        text NOT NULL DEFAULT 'NGN',
    reference       text NOT NULL DEFAULT '',
    client_id       uuid,          -- onboarding.client.id (cross-schema ref)
    related_type    text,          -- e.g. 'onboarding_case'
    related_id      uuid,
    txn_date        date NOT NULL,
    recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX internal_txn_account_idx ON reconciliation.internal_transaction (bank_account_id, txn_date);
CREATE INDEX internal_txn_reference_idx ON reconciliation.internal_transaction (reference);

CREATE TABLE reconciliation.reconciliation_run (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id uuid NOT NULL REFERENCES reconciliation.bank_account (id),
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    status          text NOT NULL DEFAULT 'draft', -- draft|in_progress|closed
    reconciled_by   uuid,
    reconciled_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation.reconciliation_match (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id           uuid NOT NULL REFERENCES reconciliation.reconciliation_run (id),
    bank_line_id     uuid REFERENCES reconciliation.bank_statement_line (id),
    internal_txn_id  uuid REFERENCES reconciliation.internal_transaction (id),
    -- matched | unmatched_bank | unmatched_internal | adjustment
    status           text NOT NULL DEFAULT 'matched',
    match_type       text NOT NULL DEFAULT 'manual', -- auto | manual
    confidence_pct   int,   -- 0–100, set by auto-matcher
    matched_by       uuid,
    notes            text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recon_match_run_idx ON reconciliation.reconciliation_match (run_id);

-- +goose Down
DROP TABLE reconciliation.reconciliation_match;
DROP TABLE reconciliation.reconciliation_run;
DROP TABLE reconciliation.internal_transaction;
DROP TABLE reconciliation.bank_statement_line;
DROP TABLE reconciliation.bank_statement;
DROP TABLE reconciliation.bank_account;
