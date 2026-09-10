-- +goose Up
-- target_status tracks whether an employee has reviewed/accepted their individual KPI scorecard
ALTER TABLE appraisal.submission
  ADD COLUMN IF NOT EXISTS target_status TEXT NOT NULL DEFAULT 'not_set';
  -- not_set  — manager hasn't saved individual KPIs yet
  -- set      — manager has saved KPIs, waiting for employee to review
  -- accepted — employee accepted the targets
  -- rejected — employee rejected, manager must revise

-- +goose Down
ALTER TABLE appraisal.submission DROP COLUMN IF EXISTS target_status;
