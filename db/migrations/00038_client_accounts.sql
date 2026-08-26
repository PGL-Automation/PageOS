-- +goose Up
-- Client account layer: tracks each investor's position in a fund —
-- how much they invested, units held, current value, and all activity.

-- ── Client investment accounts ────────────────────────────────────────────────

CREATE TABLE portfolio.client_account (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number  text          NOT NULL UNIQUE,       -- PAM/2026/0001
    client_id       uuid          NOT NULL,              -- onboarding.client.id
    client_name     text          NOT NULL DEFAULT '',
    fund_id         uuid          NOT NULL REFERENCES portfolio.fund(id),
    currency        text          NOT NULL DEFAULT 'NGN',
    -- Position tracking
    units_held      numeric(20,6) NOT NULL DEFAULT 0,    -- units in pooled funds; 0 for segregated
    invested_amount numeric(18,2) NOT NULL DEFAULT 0,    -- total cost basis (subscriptions net of redemptions)
    current_value   numeric(18,2) NOT NULL DEFAULT 0,    -- latest valuation
    realized_pnl    numeric(18,2) NOT NULL DEFAULT 0,    -- from redemptions
    unrealized_pnl  numeric(18,2) NOT NULL DEFAULT 0,    -- current_value - invested_amount
    -- Relationship management
    rm_person_id    uuid,
    rm_name         text          NOT NULL DEFAULT '',
    -- Account lifecycle
    status          text          NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','closed','suspended')),
    opened_date     date          NOT NULL,
    closed_date     date,
    -- Audit
    created_by      uuid          NOT NULL,
    created_by_name text          NOT NULL DEFAULT '',
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (client_id, fund_id)
);

CREATE INDEX idx_client_account_client ON portfolio.client_account (client_id);
CREATE INDEX idx_client_account_fund   ON portfolio.client_account (fund_id);

-- ── Client-level transactions ─────────────────────────────────────────────────

CREATE TABLE portfolio.client_transaction (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid          NOT NULL REFERENCES portfolio.client_account(id),
    txn_type        text          NOT NULL CHECK (txn_type IN (
                        'subscription',          -- client puts money in
                        'redemption',            -- client takes money out
                        'dividend_distribution', -- fund distributes income to client
                        'fee_charge',            -- management fee, advisory fee
                        'revaluation'            -- NAV mark-to-market update
                    )),
    txn_date        date          NOT NULL,
    amount          numeric(18,2) NOT NULL,      -- gross amount
    units           numeric(20,6) NOT NULL DEFAULT 0, -- units allocated/redeemed
    nav_per_unit    numeric(18,6) NOT NULL DEFAULT 1, -- NAV at time of transaction
    fees            numeric(18,2) NOT NULL DEFAULT 0,
    net_amount      numeric(18,2) NOT NULL,      -- amount ± fees
    running_balance numeric(18,2) NOT NULL DEFAULT 0, -- account value after this txn
    reference       text          NOT NULL,
    narration       text          NOT NULL DEFAULT '',
    status          text          NOT NULL DEFAULT 'completed',
    journal_id      uuid          REFERENCES finance.journal_header(id),
    created_by      uuid          NOT NULL,
    created_by_name text          NOT NULL DEFAULT '',
    created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_txn_account ON portfolio.client_transaction (account_id, txn_date DESC);

-- ── Fund NAV history ──────────────────────────────────────────────────────────

CREATE TABLE portfolio.nav (
    fund_id         uuid          NOT NULL REFERENCES portfolio.fund(id),
    nav_date        date          NOT NULL,
    nav_per_unit    numeric(18,6) NOT NULL,
    total_nav       numeric(18,2) NOT NULL DEFAULT 0,
    total_units     numeric(20,6) NOT NULL DEFAULT 0,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (fund_id, nav_date)
);

-- +goose Down
DROP TABLE IF EXISTS portfolio.nav;
DROP TABLE IF EXISTS portfolio.client_transaction;
DROP TABLE IF EXISTS portfolio.client_account;
