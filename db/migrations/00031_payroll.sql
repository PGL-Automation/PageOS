-- +goose Up
-- Payroll module: monthly runs, individual payslips, statutory schedules.
-- PAYE and pension computed from organization.grade_level salary data.

CREATE SCHEMA IF NOT EXISTS payroll;

CREATE TABLE payroll.run (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id         uuid         REFERENCES organization.subsidiary(id),
    period_year           int          NOT NULL,
    period_month          int          NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_name           text         NOT NULL,           -- e.g. "August 2026"
    status                text         NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','paid')),
    employee_count        int          NOT NULL DEFAULT 0,
    total_gross           numeric(18,2) NOT NULL DEFAULT 0,
    total_paye            numeric(18,2) NOT NULL DEFAULT 0,
    total_emp_pension     numeric(18,2) NOT NULL DEFAULT 0,
    total_employer_pension numeric(18,2) NOT NULL DEFAULT 0,
    total_net             numeric(18,2) NOT NULL DEFAULT 0,
    created_by            uuid         NOT NULL,
    created_by_name       text         NOT NULL DEFAULT '',
    approved_by           uuid,
    approved_at           timestamptz,
    journal_id            uuid         REFERENCES finance.journal_header(id),
    created_at            timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, period_year, period_month)
);

CREATE INDEX idx_payroll_run_period ON payroll.run (period_year, period_month);

CREATE TABLE payroll.payslip (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id               uuid         NOT NULL REFERENCES payroll.run(id) ON DELETE CASCADE,
    person_id            uuid         NOT NULL REFERENCES organization.person(id),
    employee_name        text         NOT NULL,
    employee_email       text         NOT NULL DEFAULT '',
    position_title       text         NOT NULL DEFAULT '',
    grade_code           text         NOT NULL DEFAULT '',
    grade_name           text         NOT NULL DEFAULT '',
    -- Earnings
    gross_salary         numeric(18,2) NOT NULL DEFAULT 0,   -- monthly gross from grade level
    basic_salary         numeric(18,2) NOT NULL DEFAULT 0,   -- 70% of gross
    housing_allowance    numeric(18,2) NOT NULL DEFAULT 0,   -- 15% of gross
    transport_allowance  numeric(18,2) NOT NULL DEFAULT 0,   -- 15% of gross
    -- PAYE
    cra                  numeric(18,2) NOT NULL DEFAULT 0,   -- Consolidated Relief Allowance
    taxable_income       numeric(18,2) NOT NULL DEFAULT 0,   -- annual
    paye_tax             numeric(18,2) NOT NULL DEFAULT 0,   -- monthly
    -- Pension
    pensionable_earnings numeric(18,2) NOT NULL DEFAULT 0,
    emp_pension          numeric(18,2) NOT NULL DEFAULT 0,   -- 8%
    employer_pension     numeric(18,2) NOT NULL DEFAULT 0,   -- 10%
    -- Net
    net_pay              numeric(18,2) NOT NULL DEFAULT 0,
    -- Flag
    has_salary           boolean      NOT NULL DEFAULT true,  -- false = contractor/no grade salary
    created_at           timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (run_id, person_id)
);

CREATE INDEX idx_payslip_run    ON payroll.payslip (run_id);
CREATE INDEX idx_payslip_person ON payroll.payslip (person_id);

-- +goose Down
DROP TABLE IF EXISTS payroll.payslip;
DROP TABLE IF EXISTS payroll.run;
DROP SCHEMA  IF EXISTS payroll;
