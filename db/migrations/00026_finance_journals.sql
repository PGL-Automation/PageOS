-- +goose Up
-- Finance: general ledger journal entries with line items.
-- Supports create (draft), post, and reversal workflows.

CREATE SCHEMA IF NOT EXISTS finance;

-- Per-year reference counter: JV/YYYY/NNN resets each calendar year.
CREATE TABLE finance.journal_ref_counter (
    year     int PRIMARY KEY,
    last_seq int NOT NULL DEFAULT 0
);

CREATE TABLE finance.journal_header (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id   uuid        REFERENCES organization.subsidiary(id),
    reference       text        NOT NULL UNIQUE,
    date            date        NOT NULL,
    type            text        NOT NULL,
    description     text        NOT NULL DEFAULT '',
    status          text        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_approval','posted','reversed')),
    debit_total     numeric(18,2) NOT NULL DEFAULT 0,
    credit_total    numeric(18,2) NOT NULL DEFAULT 0,
    line_count      int         NOT NULL DEFAULT 0,
    created_by      uuid        NOT NULL,   -- identity.users.id
    created_by_name text        NOT NULL DEFAULT '',
    posted_by       uuid,
    posted_at       timestamptz,
    reversed_by     uuid,
    reversed_at     timestamptz,
    reversal_of     uuid        REFERENCES finance.journal_header(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_header_status       ON finance.journal_header (status);
CREATE INDEX idx_journal_header_date         ON finance.journal_header (date DESC);
CREATE INDEX idx_journal_header_subsidiary   ON finance.journal_header (subsidiary_id);

CREATE TABLE finance.journal_line (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id   uuid         NOT NULL REFERENCES finance.journal_header(id) ON DELETE CASCADE,
    line_number  int          NOT NULL,
    account_code text         NOT NULL,
    account_name text         NOT NULL,
    narration    text         NOT NULL DEFAULT '',
    debit        numeric(18,2) NOT NULL DEFAULT 0,
    credit       numeric(18,2) NOT NULL DEFAULT 0,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (journal_id, line_number)
);

CREATE INDEX idx_journal_line_journal_id ON finance.journal_line (journal_id);

-- +goose Down
DROP TABLE IF EXISTS finance.journal_line;
DROP TABLE IF EXISTS finance.journal_header;
DROP TABLE IF EXISTS finance.journal_ref_counter;
DROP SCHEMA  IF EXISTS finance;
