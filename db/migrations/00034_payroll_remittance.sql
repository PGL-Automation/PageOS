-- +goose Up
-- Track statutory remittances against payroll runs.
-- Each remittance covers one obligation type (paye | pension) for one run.

CREATE TABLE payroll.remittance (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       uuid         NOT NULL REFERENCES payroll.run(id),
    type         text         NOT NULL CHECK (type IN ('paye','pension')),
    amount       numeric(18,2) NOT NULL CHECK (amount > 0),
    payment_date date         NOT NULL,
    reference    text         NOT NULL DEFAULT '', -- FIRS / PFA receipt ref
    notes        text         NOT NULL DEFAULT '',
    recorded_by  uuid         NOT NULL,
    journal_id   uuid         REFERENCES finance.journal_header(id),
    created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_remittance_run  ON payroll.remittance (run_id);
CREATE INDEX idx_remittance_type ON payroll.remittance (type);

-- +goose Down
DROP TABLE IF EXISTS payroll.remittance;
