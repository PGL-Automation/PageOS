-- +goose Up
-- Organization module: the org backbone every process hangs off.
-- Key design: a Person is stable across the whole group; their tie to a
-- subsidiary is an effective-dated Assignment (position + department + dates).
-- Promotions/transfers = close the current assignment + open a new one, so
-- history is preserved and approval routing can resolve "who held position X
-- on date D". See docs/onboarding-slice-plan.md §4, §8.

CREATE TABLE organization.subsidiary (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text        NOT NULL UNIQUE, -- e.g. PAGE_CAPITAL
    name       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization.department (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id uuid        NOT NULL REFERENCES organization.subsidiary (id),
    code          text        NOT NULL,
    name          text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, code)
);

CREATE TABLE organization.position (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- subsidiary_id NULL => group-level position shared across subsidiaries.
    subsidiary_id uuid        REFERENCES organization.subsidiary (id),
    department_id uuid        REFERENCES organization.department (id),
    code          text        NOT NULL, -- e.g. WEALTH_MANAGER, COMPLIANCE_MANAGER
    title         text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization.person (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Optional link to a login account (identity.users); staff without a
    -- login (or not yet provisioned) still exist as people.
    user_id    uuid,
    first_name text        NOT NULL,
    last_name  text        NOT NULL,
    email      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization.assignment (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id      uuid        NOT NULL REFERENCES organization.person (id),
    position_id    uuid        NOT NULL REFERENCES organization.position (id),
    subsidiary_id  uuid        NOT NULL REFERENCES organization.subsidiary (id),
    department_id  uuid        REFERENCES organization.department (id),
    effective_from date        NOT NULL,
    effective_to   date, -- NULL => currently active
    is_primary     boolean     NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignment_position_idx ON organization.assignment (position_id, effective_from, effective_to);
CREATE INDEX assignment_person_idx ON organization.assignment (person_id);

-- +goose Down
DROP TABLE organization.assignment;
DROP TABLE organization.person;
DROP TABLE organization.position;
DROP TABLE organization.department;
DROP TABLE organization.subsidiary;
