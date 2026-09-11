-- +goose Up
-- Add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_org_person_user_id ON organization.person(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appraisal_submission_manager_id ON appraisal.submission(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appraisal_submission_cycle_appraisee ON appraisal.submission(cycle_id, appraisee_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_individual_kpi_cycle_emp ON appraisal.individual_kpi(cycle_id, employee_id);

-- Add max_attempts to notification outbox (idempotent via IF NOT EXISTS)
ALTER TABLE notification.outbox ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 5;

-- updated_at trigger function
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- Apply trigger to tables that have an updated_at column
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['appraisal.cycle', 'appraisal.submission', 'appraisal.individual_kpi'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %s', t);
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = split_part(t, '.', 1)
              AND table_name  = split_part(t, '.', 2)
              AND column_name = 'updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                t
            );
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['appraisal.cycle', 'appraisal.submission', 'appraisal.individual_kpi'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %s', t);
    END LOOP;
END $$;
-- +goose StatementEnd

DROP FUNCTION IF EXISTS set_updated_at();

ALTER TABLE notification.outbox DROP COLUMN IF EXISTS max_attempts;

DROP INDEX IF EXISTS idx_appraisal_individual_kpi_cycle_emp;
DROP INDEX IF EXISTS idx_appraisal_submission_cycle_appraisee;
DROP INDEX IF EXISTS idx_appraisal_submission_manager_id;
DROP INDEX IF EXISTS idx_org_person_user_id;
