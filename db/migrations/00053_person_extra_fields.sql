-- +goose Up
-- Add extended personal information fields to organization.person
ALTER TABLE organization.person
    ADD COLUMN IF NOT EXISTS phone                          text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS date_of_birth                  date,
    ADD COLUMN IF NOT EXISTS nationality                    text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS address                        text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_contact_name         text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_contact_phone        text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE organization.person
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS date_of_birth,
    DROP COLUMN IF EXISTS nationality,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS emergency_contact_name,
    DROP COLUMN IF EXISTS emergency_contact_relationship,
    DROP COLUMN IF EXISTS emergency_contact_phone;
