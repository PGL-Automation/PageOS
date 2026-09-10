-- +goose Up
-- BSC (Balanced Scorecard) enhancements to the appraisal module.
-- Adds: phase on cycle, KPI tables, individual scorecards, and new submission fields.

-- Phase on cycle: target-setting before appraisal
ALTER TABLE appraisal.cycle ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'appraisal';

-- BSC KPI table — department-specific KPIs managed by HC, NOT preloaded
CREATE TABLE IF NOT EXISTS appraisal.kpi (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id     UUID         NOT NULL REFERENCES appraisal.cycle(id) ON DELETE CASCADE,
    department   TEXT         NOT NULL,
    perspective  TEXT         NOT NULL,        -- Financial | Client / Customer | Internal Business Process | Learning & Growth
    seq          INTEGER      NOT NULL DEFAULT 0,
    objective    TEXT         NOT NULL,
    measure      TEXT         NOT NULL,
    weight       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0),
    created_by   UUID         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appraisal_kpi_cycle_dept ON appraisal.kpi(cycle_id, department);

-- Standard targets per KPI × role × grade (HC-managed)
CREATE TABLE IF NOT EXISTS appraisal.kpi_target (
    kpi_id   UUID NOT NULL REFERENCES appraisal.kpi(id) ON DELETE CASCADE,
    role     TEXT NOT NULL,
    grade    TEXT NOT NULL,
    target   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (kpi_id, role, grade)
);

-- Individual scorecard per employee — set by line manager during target phase
CREATE TABLE IF NOT EXISTS appraisal.individual_kpi (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id     UUID         NOT NULL REFERENCES appraisal.cycle(id) ON DELETE CASCADE,
    employee_id  UUID         NOT NULL,
    perspective  TEXT         NOT NULL,
    seq          INTEGER      NOT NULL DEFAULT 0,
    objective    TEXT         NOT NULL,
    measure      TEXT         NOT NULL,
    weight       NUMERIC(5,2) NOT NULL DEFAULT 0,
    target       TEXT         NOT NULL DEFAULT '',
    source       TEXT         NOT NULL DEFAULT 'standard',   -- standard | individual
    created_by   UUID         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appraisal_ind_kpi_cycle_emp ON appraisal.individual_kpi(cycle_id, employee_id);

-- New submission fields
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS department        TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS grade             TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS level             INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS manager_id        UUID;
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS employee_comments TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS manager_comments  TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS development_plan  TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS hc_comments       TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS band              TEXT        NOT NULL DEFAULT '';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS self_json         JSONB       NOT NULL DEFAULT '{}';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS agreed_json       JSONB       NOT NULL DEFAULT '{}';
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS hc_submitted_at  TIMESTAMPTZ;
ALTER TABLE appraisal.submission ADD COLUMN IF NOT EXISTS finalized_at      TIMESTAMPTZ;

-- +goose Down
DROP TABLE IF EXISTS appraisal.individual_kpi;
DROP TABLE IF EXISTS appraisal.kpi_target;
DROP TABLE IF EXISTS appraisal.kpi;
ALTER TABLE appraisal.cycle DROP COLUMN IF EXISTS phase;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS department;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS grade;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS level;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS manager_id;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS employee_comments;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS manager_comments;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS development_plan;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS hc_comments;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS band;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS self_json;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS agreed_json;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS hc_submitted_at;
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS finalized_at;
