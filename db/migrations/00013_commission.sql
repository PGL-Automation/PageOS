-- +goose Up
-- Asset management commission infrastructure.
-- Amounts: NGN in kobo, USD in cents. Rates in basis points (bps) where 100 bps = 1%.
-- All configuration is effective-dated so history is preserved.

CREATE SCHEMA IF NOT EXISTS asset_mgmt;

-- Commission rates configured by the MD per product type.
CREATE TABLE asset_mgmt.commission_rate (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id   uuid    NOT NULL REFERENCES organization.subsidiary (id),
    product_type    text    NOT NULL,
    product_label   text    NOT NULL,
    currency        text    NOT NULL,
    mgmt_fee_bps    int     NOT NULL,
    wm_portion_pct  int     NOT NULL DEFAULT 30,
    effective_from  date    NOT NULL,
    effective_to    date,
    set_by          uuid    NOT NULL REFERENCES identity.users (id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Quarterly exchange rate set by MD for commission conversion.
CREATE TABLE asset_mgmt.exchange_rate (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id   uuid    NOT NULL REFERENCES organization.subsidiary (id),
    from_currency   text    NOT NULL DEFAULT 'USD',
    to_currency     text    NOT NULL DEFAULT 'NGN',
    rate_kobo       bigint  NOT NULL,
    quarter         int     NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    year            int     NOT NULL,
    set_by          uuid    NOT NULL REFERENCES identity.users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, from_currency, to_currency, quarter, year)
);

-- Quarterly targets set by MD for each Wealth Manager.
CREATE TABLE asset_mgmt.wm_target (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id        uuid    NOT NULL REFERENCES organization.subsidiary (id),
    wm_user_id           uuid    NOT NULL REFERENCES identity.users (id),
    quarter              int     NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    year                 int     NOT NULL,
    aum_target_ngn_kobo  bigint  NOT NULL DEFAULT 0,
    aum_target_usd_cents bigint  NOT NULL DEFAULT 0,
    client_count_target  int     NOT NULL DEFAULT 0,
    set_by               uuid    NOT NULL REFERENCES identity.users (id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, wm_user_id, quarter, year)
);

-- Seed default commission rates using a CTE to avoid dollar-quoting issues.
-- goose StatementBegin
INSERT INTO asset_mgmt.commission_rate
    (subsidiary_id, product_type, product_label, currency, mgmt_fee_bps, wm_portion_pct, effective_from, set_by)
SELECT
    s.id,
    v.product_type,
    v.product_label,
    v.currency,
    v.mgmt_fee_bps,
    30,
    '2026-01-01'::date,
    u.id
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('money_market_ngn',  'Money Market (NGN)',         'NGN', 50),
    ('fixed_income_ngn',  'Fixed Income (NGN)',         'NGN', 100),
    ('equity_ngn',        'Equity (NGN)',               'NGN', 150),
    ('dollar_mmf_usd',    'Dollar Money Market (USD)',  'USD', 40),
    ('dollar_bond_usd',   'Dollar Fixed Income (USD)', 'USD', 80)
) AS v(product_type, product_label, currency, mgmt_fee_bps)
CROSS JOIN (SELECT id FROM identity.users ORDER BY created_at LIMIT 1) u
WHERE s.code = 'PAGE_CAPITAL'
ON CONFLICT DO NOTHING;
-- goose StatementEnd

-- goose StatementBegin
INSERT INTO asset_mgmt.exchange_rate
    (subsidiary_id, from_currency, to_currency, rate_kobo, quarter, year, set_by)
SELECT
    s.id, 'USD', 'NGN',
    v.rate_kobo,
    v.quarter,
    2026,
    u.id
FROM organization.subsidiary s
CROSS JOIN (VALUES
    (4, 162000),
    (3, 158000),
    (2, 152000),
    (1, 149000)
) AS v(quarter, rate_kobo)
CROSS JOIN (SELECT id FROM identity.users ORDER BY created_at LIMIT 1) u
WHERE s.code = 'PAGE_CAPITAL'
ON CONFLICT DO NOTHING;
-- goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS asset_mgmt.wm_target;
DROP TABLE IF EXISTS asset_mgmt.exchange_rate;
DROP TABLE IF EXISTS asset_mgmt.commission_rate;
DROP SCHEMA IF EXISTS asset_mgmt;
