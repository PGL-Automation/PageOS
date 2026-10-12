-- +goose Up
-- Allow effective_date to be NULL in client_posting so rows with
-- unparseable date formats are not silently dropped.
ALTER TABLE finance.client_posting ALTER COLUMN effective_date DROP NOT NULL;

-- +goose Down
-- Rows with NULL effective_date will fail if re-added constraint.
-- Safe only if all NULLs are resolved first.
UPDATE finance.client_posting SET effective_date = business_date WHERE effective_date IS NULL AND business_date IS NOT NULL;
ALTER TABLE finance.client_posting ALTER COLUMN effective_date SET NOT NULL;
