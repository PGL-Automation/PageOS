-- +goose Up
-- Leave management: policies, per-person balances, and requests.

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE hr.leave_policy (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code              text        NOT NULL UNIQUE,
    name              text        NOT NULL,
    days_per_year     int         NOT NULL DEFAULT 0,
    requires_approval boolean     NOT NULL DEFAULT true,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Per-person, per-year entitlement (HR sets this; defaults from policy).
CREATE TABLE hr.leave_balance (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id    uuid         NOT NULL REFERENCES organization.person(id) ON DELETE CASCADE,
    policy_id    uuid         NOT NULL REFERENCES hr.leave_policy(id),
    year         int          NOT NULL,
    days_granted numeric(5,1) NOT NULL DEFAULT 0,
    UNIQUE (person_id, policy_id, year)
);

CREATE TABLE hr.leave_request (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id          uuid         NOT NULL REFERENCES organization.person(id),
    policy_id          uuid         NOT NULL REFERENCES hr.leave_policy(id),
    start_date         date         NOT NULL,
    end_date           date         NOT NULL,
    days_count         numeric(5,1) NOT NULL,
    status             text         NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','cancelled')),
    notes              text         NOT NULL DEFAULT '',
    reviewer_person_id uuid         REFERENCES organization.person(id),
    reviewer_note      text         NOT NULL DEFAULT '',
    reviewed_at        timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_request_person_id ON hr.leave_request (person_id);
CREATE INDEX idx_leave_request_status    ON hr.leave_request (status);
CREATE INDEX idx_leave_request_dates     ON hr.leave_request (start_date, end_date);

-- Standard leave policies (Nigerian financial services norms).
INSERT INTO hr.leave_policy (code, name, days_per_year, requires_approval, is_active) VALUES
    ('ANNUAL',        'Annual Leave',        21, true, true),
    ('SICK',          'Sick Leave',          12, true, true),
    ('MATERNITY',     'Maternity Leave',     90, true, true),
    ('PATERNITY',     'Paternity Leave',      5, true, true),
    ('STUDY',         'Study / Exam Leave',   5, true, true),
    ('COMPASSIONATE', 'Compassionate Leave',  3, true, true);

-- Seed 2026 annual leave balances for every employee seeded in 00022.
-- +goose StatementBegin
INSERT INTO hr.leave_balance (person_id, policy_id, year, days_granted)
SELECT p.id, pol.id, 2026, pol.days_per_year
FROM   organization.person p
CROSS  JOIN hr.leave_policy pol
WHERE  pol.code = 'ANNUAL'
  AND  EXISTS (
           SELECT 1 FROM organization.assignment a
           WHERE  a.person_id    = p.id
             AND  a.effective_to IS NULL
       )
ON CONFLICT (person_id, policy_id, year) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS hr.leave_request;
DROP TABLE IF EXISTS hr.leave_balance;
DROP TABLE IF EXISTS hr.leave_policy;
DROP SCHEMA  IF EXISTS hr;
