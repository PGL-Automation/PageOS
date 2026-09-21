-- +goose Up
CREATE TABLE finance.fx_rate (
    from_currency TEXT NOT NULL,
    to_currency   TEXT NOT NULL,
    rate_date     DATE NOT NULL,
    rate          NUMERIC(18,6) NOT NULL CHECK (rate > 0),
    source        TEXT NOT NULL DEFAULT 'manual',
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (from_currency, to_currency, rate_date)
);

CREATE INDEX ix_fx_rate_rate_date ON finance.fx_rate (rate_date DESC);

-- +goose Down
DROP INDEX IF EXISTS finance.ix_fx_rate_rate_date;
DROP TABLE IF EXISTS finance.fx_rate;
