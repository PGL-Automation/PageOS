-- +goose Up
-- Per-assignment manager override: lets HR assign a specific person as
-- someone's direct line manager, independent of the position hierarchy.

ALTER TABLE organization.assignment
    ADD COLUMN IF NOT EXISTS manager_override_person_id uuid
        REFERENCES organization.person (id) ON DELETE SET NULL;

COMMENT ON COLUMN organization.assignment.manager_override_person_id IS
    'Optional direct line manager override for this specific assignment.
     When set, supersedes the reporting line implied by position.reports_to_position_id.
     NULL = use the default position hierarchy.';

-- +goose Down
ALTER TABLE organization.assignment DROP COLUMN IF EXISTS manager_override_person_id;
