-- +goose Up
-- Restrict gender to M and F only (removing "other").
ALTER TABLE organization.person DROP CONSTRAINT IF EXISTS person_gender_check;
ALTER TABLE organization.person
    ADD CONSTRAINT person_gender_check CHECK (gender IN ('M','F'));

ALTER TABLE hr.leave_policy DROP CONSTRAINT IF EXISTS leave_policy_applicable_gender_check;
ALTER TABLE hr.leave_policy
    ADD CONSTRAINT leave_policy_applicable_gender_check
        CHECK (applicable_gender IN ('M','F'));

-- +goose Down
ALTER TABLE organization.person DROP CONSTRAINT IF EXISTS person_gender_check;
ALTER TABLE organization.person
    ADD CONSTRAINT person_gender_check CHECK (gender IN ('M','F','other'));

ALTER TABLE hr.leave_policy DROP CONSTRAINT IF EXISTS leave_policy_applicable_gender_check;
ALTER TABLE hr.leave_policy
    ADD CONSTRAINT leave_policy_applicable_gender_check
        CHECK (applicable_gender IN ('M','F'));
