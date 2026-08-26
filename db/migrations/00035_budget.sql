-- +goose Up
-- Budget module: monthly account-level budget targets for variance reporting.

CREATE TABLE finance.budget (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id uuid          REFERENCES organization.subsidiary(id),
    account_code  text          NOT NULL REFERENCES finance.account(code),
    period_year   int           NOT NULL,
    period_month  int           NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    amount        numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    created_by    uuid          NOT NULL,
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    created_at    timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, account_code, period_year, period_month)
);

CREATE INDEX idx_budget_period ON finance.budget (period_year, period_month);
CREATE INDEX idx_budget_account ON finance.budget (account_code);

-- +goose Down
DROP TABLE IF EXISTS finance.budget;
