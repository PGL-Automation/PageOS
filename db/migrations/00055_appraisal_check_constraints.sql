-- +goose Up
-- Add CHECK constraints on all state-machine columns in appraisal schema

ALTER TABLE appraisal.cycle
    ADD CONSTRAINT chk_cycle_phase CHECK (phase IS NULL OR phase IN ('target', 'appraisal')),
    ADD CONSTRAINT chk_cycle_status CHECK (status IN ('draft', 'open', 'closed', 'archived'));

ALTER TABLE appraisal.submission
    ADD CONSTRAINT chk_submission_status CHECK (status IN ('pending', 'self_draft', 'self_submitted', 'manager_scoring', 'submitted_to_hc', 'finalized', 'withdrawn', 'completed')),
    ADD CONSTRAINT chk_submission_target_status CHECK (target_status IS NULL OR target_status IN ('not_set', 'set', 'accepted', 'rejected'));

-- Fix cascade on submission to prevent accidental data loss
ALTER TABLE appraisal.submission DROP CONSTRAINT IF EXISTS appraisal_submission_cycle_id_fkey;
ALTER TABLE appraisal.submission ADD CONSTRAINT appraisal_submission_cycle_id_fkey
    FOREIGN KEY (cycle_id) REFERENCES appraisal.cycle(id) ON DELETE RESTRICT;

ALTER TABLE appraisal.reviewer_assignment DROP CONSTRAINT IF EXISTS reviewer_assignment_cycle_id_fkey;
ALTER TABLE appraisal.reviewer_assignment ADD CONSTRAINT reviewer_assignment_cycle_id_fkey
    FOREIGN KEY (cycle_id) REFERENCES appraisal.cycle(id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE appraisal.reviewer_assignment DROP CONSTRAINT IF EXISTS reviewer_assignment_cycle_id_fkey;
ALTER TABLE appraisal.reviewer_assignment ADD CONSTRAINT reviewer_assignment_cycle_id_fkey
    FOREIGN KEY (cycle_id) REFERENCES appraisal.cycle(id) ON DELETE CASCADE;

ALTER TABLE appraisal.submission DROP CONSTRAINT IF EXISTS appraisal_submission_cycle_id_fkey;
ALTER TABLE appraisal.submission ADD CONSTRAINT appraisal_submission_cycle_id_fkey
    FOREIGN KEY (cycle_id) REFERENCES appraisal.cycle(id) ON DELETE CASCADE;

ALTER TABLE appraisal.submission
    DROP CONSTRAINT IF EXISTS chk_submission_target_status,
    DROP CONSTRAINT IF EXISTS chk_submission_status;

ALTER TABLE appraisal.cycle
    DROP CONSTRAINT IF EXISTS chk_cycle_status,
    DROP CONSTRAINT IF EXISTS chk_cycle_phase;
