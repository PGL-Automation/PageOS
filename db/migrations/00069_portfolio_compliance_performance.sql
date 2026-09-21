-- +goose Up

CREATE TABLE portfolio.compliance_rule (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id     UUID        NOT NULL REFERENCES portfolio.fund(id),
    rule_type   TEXT        NOT NULL CHECK (rule_type IN ('max_single_issuer','max_asset_class','min_asset_class','max_single_instrument','min_cash','max_single_sector')),
    target      TEXT        NOT NULL,
    limit_pct   NUMERIC(5,2) NOT NULL CHECK (limit_pct >= 0 AND limit_pct <= 100),
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_by  UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_rule_fund_id    ON portfolio.compliance_rule (fund_id);
CREATE INDEX idx_compliance_rule_is_active  ON portfolio.compliance_rule (is_active);
CREATE INDEX idx_compliance_rule_rule_type  ON portfolio.compliance_rule (rule_type);

CREATE TABLE portfolio.compliance_breach (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id             UUID        NOT NULL REFERENCES portfolio.fund(id),
    rule_id             UUID        NOT NULL REFERENCES portfolio.compliance_rule(id),
    breach_date         DATE        NOT NULL,
    current_pct         NUMERIC(5,2) NOT NULL,
    limit_pct           NUMERIC(5,2) NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
    acknowledged_by     UUID,
    acknowledged_at     TIMESTAMPTZ,
    resolution_notes    TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_breach_fund_id     ON portfolio.compliance_breach (fund_id);
CREATE INDEX idx_compliance_breach_rule_id     ON portfolio.compliance_breach (rule_id);
CREATE INDEX idx_compliance_breach_breach_date ON portfolio.compliance_breach (breach_date);
CREATE INDEX idx_compliance_breach_status      ON portfolio.compliance_breach (status);

CREATE TABLE portfolio.fund_performance (
    fund_id              UUID         NOT NULL REFERENCES portfolio.fund(id),
    calc_date            DATE         NOT NULL,
    period               TEXT         NOT NULL CHECK (period IN ('1d','1w','1m','3m','6m','1y','ytd','inception')),
    twr_pct              NUMERIC(10,6),
    mwr_pct              NUMERIC(10,6),
    volatility_pct       NUMERIC(10,6),
    sharpe_ratio         NUMERIC(10,6),
    benchmark_return_pct NUMERIC(10,6),
    excess_return_pct    NUMERIC(10,6),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (fund_id, calc_date, period)
);

CREATE INDEX idx_fund_performance_fund_id   ON portfolio.fund_performance (fund_id);
CREATE INDEX idx_fund_performance_calc_date ON portfolio.fund_performance (calc_date);
CREATE INDEX idx_fund_performance_period    ON portfolio.fund_performance (period);

CREATE TABLE reconciliation.bank_connectivity (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id      UUID        NOT NULL REFERENCES reconciliation.bank_account(id),
    provider             TEXT        NOT NULL CHECK (provider IN ('mono','okra','sftp','manual')),
    provider_account_id  TEXT        NOT NULL DEFAULT '',
    provider_customer_id TEXT        NOT NULL DEFAULT '',
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    last_pulled_at       TIMESTAMPTZ,
    last_pull_status     TEXT        NOT NULL DEFAULT 'never' CHECK (last_pull_status IN ('never','success','failed')),
    last_pull_error      TEXT        NOT NULL DEFAULT '',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bank_account_id, provider)
);

CREATE INDEX idx_bank_connectivity_bank_account_id ON reconciliation.bank_connectivity (bank_account_id);
CREATE INDEX idx_bank_connectivity_provider        ON reconciliation.bank_connectivity (provider);
CREATE INDEX idx_bank_connectivity_is_active       ON reconciliation.bank_connectivity (is_active);

-- +goose Down

DROP TABLE IF EXISTS reconciliation.bank_connectivity;
DROP TABLE IF EXISTS portfolio.fund_performance;
DROP TABLE IF EXISTS portfolio.compliance_breach;
DROP TABLE IF EXISTS portfolio.compliance_rule;
