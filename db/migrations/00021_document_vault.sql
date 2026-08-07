-- +goose Up
ALTER TABLE documents.document
  ADD COLUMN vault_type      text NOT NULL DEFAULT 'onboarding',
  ADD COLUMN category        text NOT NULL DEFAULT '',
  ADD COLUMN subject_user_id uuid;

-- Backfill existing HR employee uploads (have for_employee_id but no case_id in context)
UPDATE documents.document
SET vault_type = 'hr_employee',
    subject_user_id = (context->>'for_employee_id')::uuid
WHERE context ? 'for_employee_id' AND NOT (context ? 'case_id');

CREATE INDEX doc_vault_personal_idx ON documents.document (uploaded_by, created_at DESC)
  WHERE vault_type = 'personal';
CREATE INDEX doc_vault_hr_idx ON documents.document (subject_user_id, created_at DESC)
  WHERE vault_type = 'hr_employee';

-- +goose Down
DROP INDEX IF EXISTS doc_vault_personal_idx;
DROP INDEX IF EXISTS doc_vault_hr_idx;
ALTER TABLE documents.document
  DROP COLUMN vault_type,
  DROP COLUMN category,
  DROP COLUMN subject_user_id;
