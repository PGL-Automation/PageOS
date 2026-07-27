-- +goose Up
-- Append-only audit log. Every mutating capability writes one row.
-- Non-negotiable for a financial system (see docs/onboarding-slice-plan.md §11).

CREATE TABLE audit.audit_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    actor_type    text        NOT NULL,          -- user | agent | system
    actor_id      text        NOT NULL DEFAULT '',
    action        text        NOT NULL,          -- e.g. identity.user.registered
    resource_type text        NOT NULL DEFAULT '',
    resource_id   text        NOT NULL DEFAULT '',
    request_id    text        NOT NULL DEFAULT '',
    context       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_resource_idx ON audit.audit_log (resource_type, resource_id);
CREATE INDEX audit_log_occurred_idx ON audit.audit_log (occurred_at);

-- +goose Down
DROP TABLE audit.audit_log;
