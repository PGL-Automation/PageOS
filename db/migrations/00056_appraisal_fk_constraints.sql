-- +goose Up
-- Add missing FK constraints

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisal_submission_manager_id_fkey') THEN
        ALTER TABLE appraisal.submission ADD CONSTRAINT appraisal_submission_manager_id_fkey
            FOREIGN KEY (manager_id) REFERENCES identity.users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisal_individual_kpi_employee_id_fkey') THEN
        ALTER TABLE appraisal.individual_kpi ADD CONSTRAINT appraisal_individual_kpi_employee_id_fkey
            FOREIGN KEY (employee_id) REFERENCES identity.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_person_user_id_fkey') THEN
        ALTER TABLE organization.person ADD CONSTRAINT org_person_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- +goose Down
ALTER TABLE organization.person DROP CONSTRAINT IF EXISTS org_person_user_id_fkey;
ALTER TABLE appraisal.individual_kpi DROP CONSTRAINT IF EXISTS appraisal_individual_kpi_employee_id_fkey;
ALTER TABLE appraisal.submission DROP CONSTRAINT IF EXISTS appraisal_submission_manager_id_fkey;
