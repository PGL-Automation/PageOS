-- +goose Up

-- Gender on the person record. NULL = not set / prefer not to say.
ALTER TABLE organization.person
    ADD COLUMN IF NOT EXISTS gender text
        CHECK (gender IN ('M','F','other'));

-- Applicable gender on leave policy. NULL = no restriction.
ALTER TABLE hr.leave_policy
    ADD COLUMN IF NOT EXISTS applicable_gender text
        CHECK (applicable_gender IN ('M','F'));

-- Wire the two gender-specific policies.
UPDATE hr.leave_policy SET applicable_gender = 'F' WHERE code = 'MATERNITY';
UPDATE hr.leave_policy SET applicable_gender = 'M' WHERE code = 'PATERNITY';

-- +goose Down
UPDATE hr.leave_policy SET applicable_gender = NULL;
ALTER TABLE hr.leave_policy  DROP COLUMN IF EXISTS applicable_gender;
ALTER TABLE organization.person DROP COLUMN IF EXISTS gender;
