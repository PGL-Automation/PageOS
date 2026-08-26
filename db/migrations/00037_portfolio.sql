-- +goose Up
-- Investment Asset Management: instruments master, funds/mandates,
-- holdings (positions), trade transactions, price history.
-- GL integration is automatic — every trade posts a journal entry.

CREATE SCHEMA IF NOT EXISTS portfolio;

-- ── Securities / Instruments master ──────────────────────────────────────────

CREATE TABLE portfolio.instrument (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker          text          NOT NULL UNIQUE,
    name            text          NOT NULL,
    asset_class     text          NOT NULL
                        CHECK (asset_class IN ('equity','fixed_income','money_market','real_estate','cash_equivalent')),
    exchange        text          NOT NULL DEFAULT '',   -- NSE, FMDQ, NGX, OTC
    currency        text          NOT NULL DEFAULT 'NGN',
    -- Bond / T-bill fields (nullable for equities)
    face_value      numeric(18,4),                      -- par value per unit (100 for bonds)
    coupon_rate     numeric(5,2),                       -- % annual coupon
    maturity_date   date,
    issuer          text          NOT NULL DEFAULT '',
    sector          text          NOT NULL DEFAULT '',   -- Financials, Consumer, etc.
    -- GL account codes (auto-set by asset class, overridable)
    gl_account_code text          NOT NULL DEFAULT '1201',
    gain_gl_code    text          NOT NULL DEFAULT '4013',
    loss_gl_code    text          NOT NULL DEFAULT '5803',
    cost_gl_code    text          NOT NULL DEFAULT '5800',
    income_gl_code  text          NOT NULL DEFAULT '4010',
    is_active       boolean       NOT NULL DEFAULT true,
    created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_instrument_class ON portfolio.instrument (asset_class);

-- ── Funds / Mandates / Portfolios ─────────────────────────────────────────────

CREATE TABLE portfolio.fund (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text          NOT NULL UNIQUE,
    name            text          NOT NULL,
    fund_type       text          NOT NULL
                        CHECK (fund_type IN ('pooled','segregated','proprietary')),
    -- pooled   = multiple investors (mutual fund, fixed income fund)
    -- segregated = single high-net-worth client mandate
    -- proprietary = firm's own money
    benchmark       text          NOT NULL DEFAULT '',
    currency        text          NOT NULL DEFAULT 'NGN',
    inception_date  date          NOT NULL,
    target_return   numeric(5,2),                        -- % annual target
    status          text          NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','closed','suspended')),
    client_id       uuid,                                -- onboarding.client.id (segregated only)
    subsidiary_id   uuid          REFERENCES organization.subsidiary(id),
    aum             numeric(18,2) NOT NULL DEFAULT 0,    -- AUM updated on each transaction
    created_by      uuid          NOT NULL,
    created_by_name text          NOT NULL DEFAULT '',
    created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ── Current holdings (live positions) ────────────────────────────────────────

CREATE TABLE portfolio.holding (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id         uuid          NOT NULL REFERENCES portfolio.fund(id) ON DELETE CASCADE,
    instrument_id   uuid          NOT NULL REFERENCES portfolio.instrument(id),
    quantity        numeric(20,6) NOT NULL DEFAULT 0,    -- number of units held
    avg_cost        numeric(18,6) NOT NULL DEFAULT 0,    -- weighted average cost per unit
    book_value      numeric(18,2) NOT NULL DEFAULT 0,    -- quantity * avg_cost
    market_price    numeric(18,6),                       -- latest price
    market_value    numeric(18,2),                       -- quantity * market_price
    unrealized_pnl  numeric(18,2),                       -- market_value - book_value
    last_priced_at  timestamptz,
    updated_at      timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (fund_id, instrument_id)
);

CREATE INDEX idx_holding_fund ON portfolio.holding (fund_id);

-- ── Transaction log (trade blotter) ──────────────────────────────────────────

CREATE TABLE portfolio.transaction (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id         uuid          NOT NULL REFERENCES portfolio.fund(id),
    instrument_id   uuid          REFERENCES portfolio.instrument(id),
    txn_type        text          NOT NULL CHECK (txn_type IN (
                        'buy','sell',
                        'subscription','redemption',
                        'dividend','coupon','interest',
                        'fee','revaluation'
                    )),
    trade_date      date          NOT NULL,
    settlement_date date,
    quantity        numeric(20,6),
    price           numeric(18,6),
    gross_amount    numeric(18,2) NOT NULL DEFAULT 0,
    fees            numeric(18,2) NOT NULL DEFAULT 0,
    net_amount      numeric(18,2) NOT NULL DEFAULT 0,
    realized_pnl    numeric(18,2) NOT NULL DEFAULT 0,    -- on sell
    currency        text          NOT NULL DEFAULT 'NGN',
    reference       text          NOT NULL,
    narration       text          NOT NULL DEFAULT '',
    status          text          NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','settled','cancelled')),
    journal_id      uuid          REFERENCES finance.journal_header(id),
    created_by      uuid          NOT NULL,
    created_by_name text          NOT NULL DEFAULT '',
    created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_txn_fund      ON portfolio.transaction (fund_id, trade_date DESC);
CREATE INDEX idx_portfolio_txn_instrument ON portfolio.transaction (instrument_id);

-- ── Price history ─────────────────────────────────────────────────────────────

CREATE TABLE portfolio.price (
    instrument_id   uuid          NOT NULL REFERENCES portfolio.instrument(id),
    price_date      date          NOT NULL,
    close_price     numeric(18,6) NOT NULL,
    source          text          NOT NULL DEFAULT 'manual',
    created_at      timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (instrument_id, price_date)
);

-- +goose Down
DROP TABLE IF EXISTS portfolio.price;
DROP TABLE IF EXISTS portfolio.transaction;
DROP TABLE IF EXISTS portfolio.holding;
DROP TABLE IF EXISTS portfolio.fund;
DROP TABLE IF EXISTS portfolio.instrument;
DROP SCHEMA  IF EXISTS portfolio;
