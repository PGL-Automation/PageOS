-- +goose Up

ALTER TABLE portfolio.nav ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE portfolio.target_allocation (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id         UUID        NOT NULL REFERENCES portfolio.fund(id),
    allocation_type TEXT        NOT NULL CHECK (allocation_type IN ('asset_class', 'instrument', 'sector', 'issuer')),
    instrument_id   UUID        REFERENCES portfolio.instrument(id),
    label           TEXT        NOT NULL DEFAULT '',
    target_pct      NUMERIC(5,2) NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100),
    min_pct         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (min_pct >= 0),
    max_pct         NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (max_pct >= 0),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_by      UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fund_id, allocation_type, COALESCE(instrument_id, '00000000-0000-0000-0000-000000000000'::uuid), label)
);

CREATE INDEX idx_target_allocation_fund_id
    ON portfolio.target_allocation (fund_id);

CREATE INDEX idx_target_allocation_fund_id_is_active
    ON portfolio.target_allocation (fund_id, is_active);

-- +goose Down

DROP INDEX IF EXISTS portfolio.idx_target_allocation_fund_id_is_active;
DROP INDEX IF EXISTS portfolio.idx_target_allocation_fund_id;
DROP TABLE IF EXISTS portfolio.target_allocation;

ALTER TABLE portfolio.nav DROP COLUMN IF EXISTS updated_at;
