-- +goose Up
-- Fixed Asset Register: asset master, depreciation runs, and disposal records.

CREATE TABLE finance.asset (
    id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           text         NOT NULL UNIQUE,         -- AST/2026/001
    subsidiary_id       uuid         REFERENCES organization.subsidiary(id),
    name                text         NOT NULL,
    description         text         NOT NULL DEFAULT '',
    category            text         NOT NULL,                -- Computer Equipment, Furniture, etc.
    asset_account_code  text         NOT NULL DEFAULT '1301', -- Dr this on acquisition
    accum_dep_code      text         NOT NULL DEFAULT '1310', -- Cr this on depreciation
    dep_expense_code    text         NOT NULL DEFAULT '5600', -- Dr this on depreciation
    acquisition_date    date         NOT NULL,
    acquisition_cost    numeric(18,2) NOT NULL,
    salvage_value       numeric(18,2) NOT NULL DEFAULT 0,
    useful_life_months  int          NOT NULL,
    dep_method          text         NOT NULL DEFAULT 'straight_line'
                            CHECK (dep_method IN ('straight_line','reducing_balance')),
    annual_dep_rate     numeric(5,2) NOT NULL DEFAULT 0,       -- for reducing balance (%)
    status              text         NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','disposed','fully_depreciated')),
    book_value          numeric(18,2) NOT NULL DEFAULT 0,
    accum_depreciation  numeric(18,2) NOT NULL DEFAULT 0,
    last_dep_period     text,                                  -- "2026-08"
    journal_id          uuid         REFERENCES finance.journal_header(id), -- acquisition journal
    created_by          uuid         NOT NULL,
    created_by_name     text         NOT NULL DEFAULT '',
    created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_status  ON finance.asset (status);
CREATE INDEX idx_asset_sub     ON finance.asset (subsidiary_id);

CREATE TABLE finance.asset_dep_run (
    id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id         uuid         NOT NULL REFERENCES finance.asset(id) ON DELETE CASCADE,
    period           text         NOT NULL,   -- "2026-08"
    dep_amount       numeric(18,2) NOT NULL,
    book_value_after numeric(18,2) NOT NULL,
    journal_id       uuid         REFERENCES finance.journal_header(id),
    created_at       timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (asset_id, period)
);

CREATE TABLE finance.asset_disposal (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id        uuid         NOT NULL REFERENCES finance.asset(id),
    disposal_date   date         NOT NULL,
    disposal_amount numeric(18,2) NOT NULL DEFAULT 0,
    gain_loss       numeric(18,2) NOT NULL DEFAULT 0,
    journal_id      uuid         REFERENCES finance.journal_header(id),
    notes           text         NOT NULL DEFAULT '',
    created_by      uuid         NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS finance.asset_disposal;
DROP TABLE IF EXISTS finance.asset_dep_run;
DROP TABLE IF EXISTS finance.asset;
