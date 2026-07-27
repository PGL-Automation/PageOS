-- +goose Up
CREATE TABLE onboarding.compliance_check (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      uuid        NOT NULL REFERENCES onboarding.onboarding_case (id),
    check_type   text        NOT NULL,
    outcome      text        NOT NULL, -- pass, fail, needs_info
    notes        text        NOT NULL DEFAULT '',
    source       text        NOT NULL DEFAULT 'manual', -- manual, api
    performed_by uuid        NOT NULL, -- identity.users.id
    performed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (case_id, check_type)
);

CREATE INDEX compliance_check_case_idx ON onboarding.compliance_check (case_id);

-- +goose Down
DROP TABLE onboarding.compliance_check;
