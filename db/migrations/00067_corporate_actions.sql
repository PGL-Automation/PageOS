-- +goose Up
CREATE TABLE portfolio.corporate_action (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id    UUID        NOT NULL REFERENCES portfolio.instrument(id),
    action_type      TEXT        NOT NULL CHECK (action_type IN ('cash_dividend','stock_dividend','stock_split','bonus_share','rights_issue','coupon_payment','maturity')),
    ex_date          DATE        NOT NULL,
    record_date      DATE,
    pay_date         DATE,
    amount_per_unit  NUMERIC(18,6),
    currency         TEXT        NOT NULL DEFAULT 'NGN',
    split_ratio      NUMERIC(10,6),
    bonus_ratio      NUMERIC(10,6),
    rights_ratio     NUMERIC(10,6),
    rights_price     NUMERIC(18,2),
    status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','cancelled')),
    notes            TEXT        NOT NULL DEFAULT '',
    processed_at     TIMESTAMPTZ,
    processed_by     UUID,
    created_by       UUID        NOT NULL,
    created_by_name  TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_corporate_action_instrument_ex_date ON portfolio.corporate_action(instrument_id, ex_date);
CREATE INDEX idx_corporate_action_status_ex_date     ON portfolio.corporate_action(status, ex_date);

CREATE TABLE portfolio.corporate_action_impact (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_action_id      UUID        NOT NULL REFERENCES portfolio.corporate_action(id),
    fund_id                  UUID        NOT NULL REFERENCES portfolio.fund(id),
    instrument_id            UUID        NOT NULL REFERENCES portfolio.instrument(id),
    holding_quantity_before  NUMERIC(20,6) NOT NULL DEFAULT 0,
    holding_quantity_after   NUMERIC(20,6) NOT NULL DEFAULT 0,
    cash_distributed         NUMERIC(18,2) NOT NULL DEFAULT 0,
    wht_deducted             NUMERIC(18,2) NOT NULL DEFAULT 0,
    net_cash                 NUMERIC(18,2) NOT NULL DEFAULT 0,
    journal_id               UUID        REFERENCES finance.journal_header(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_corporate_action_impact_action ON portfolio.corporate_action_impact(corporate_action_id);
CREATE INDEX idx_corporate_action_impact_fund   ON portfolio.corporate_action_impact(fund_id);

-- +goose Down
DROP TABLE IF EXISTS portfolio.corporate_action_impact;
DROP TABLE IF EXISTS portfolio.corporate_action;
