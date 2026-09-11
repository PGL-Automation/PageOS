-- +goose Up
-- Add missing FK constraints

ALTER TABLE appraisal.submission
    ADD CONSTRAINT IF NOT EXISTS appraisal_submission_manager_id_fkey
        FOREIGN KEY (manager_id) REFERENCES identity.users(id) ON DELETE SET NULL;

ALTER TABLE appraisal.individual_kpi
    ADD CONSTRAINT IF NOT EXISTS appraisal_individual_kpi_employee_id_fkey
        FOREIGN KEY (employee_id) REFERENCES identity.users(id) ON DELETE CASCADE;

ALTER TABLE organization.person
    ADD CONSTRAINT IF NOT EXISTS org_person_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE organization.person DROP CONSTRAINT IF EXISTS org_person_user_id_fkey;
ALTER TABLE appraisal.individual_kpi DROP CONSTRAINT IF EXISTS appraisal_individual_kpi_employee_id_fkey;
ALTER TABLE appraisal.submission DROP CONSTRAINT IF EXISTS appraisal_submission_manager_id_fkey;
