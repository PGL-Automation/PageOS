-- +goose Up
-- Backfill NULL phase to 'target' so backend and frontend agree on default
UPDATE appraisal.cycle SET phase = 'target' WHERE phase IS NULL;
-- After backfill, set default to 'target' (column already NOT NULL from 00051)
ALTER TABLE appraisal.cycle ALTER COLUMN phase SET DEFAULT 'target';

-- Add snapshot_date to cycle so GenerateBSCSubmissions can filter by effective date
ALTER TABLE appraisal.cycle ADD COLUMN IF NOT EXISTS snapshot_date date;
UPDATE appraisal.cycle SET snapshot_date = created_at::date WHERE snapshot_date IS NULL;

-- JSONB validation on self_json and agreed_json
ALTER TABLE appraisal.submission
    ADD CONSTRAINT chk_self_json_is_object CHECK (self_json IS NULL OR jsonb_typeof(self_json) = 'object');
ALTER TABLE appraisal.submission
    ADD CONSTRAINT chk_agreed_json_is_object CHECK (agreed_json IS NULL OR jsonb_typeof(agreed_json) = 'object');

-- +goose Down
ALTER TABLE appraisal.submission
    DROP CONSTRAINT IF EXISTS chk_self_json_is_object,
    DROP CONSTRAINT IF EXISTS chk_agreed_json_is_object;
ALTER TABLE appraisal.cycle DROP COLUMN IF EXISTS snapshot_date;
ALTER TABLE appraisal.cycle ALTER COLUMN phase SET DEFAULT 'appraisal';
