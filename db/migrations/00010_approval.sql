-- +goose Up
-- Lean shared approval core. Deliberately minimal: no DSL, no delegation,
-- no SLA — only what the onboarding review chain actually needs v1.
-- See docs/onboarding-slice-plan.md §8 and pageos-approval-core-decision.md.

CREATE TABLE approval.approval_request (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type text        NOT NULL,            -- e.g. 'onboarding_case'
    resource_id   uuid        NOT NULL,
    routing_key   text        NOT NULL DEFAULT '', -- documents which routing fn was used
    context       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- pending | in_progress | approved | rejected | returned
    status        text        NOT NULL DEFAULT 'pending',
    created_by    uuid        NOT NULL,            -- identity.users.id
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approval_request_resource_idx
    ON approval.approval_request (resource_type, resource_id);

CREATE TABLE approval.approval_step (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid        NOT NULL REFERENCES approval.approval_request (id) ON DELETE CASCADE,
    step_order  int         NOT NULL,
    position_id uuid        NOT NULL,   -- organization.position (cross-schema ref)
    label       text        NOT NULL DEFAULT '',
    -- pending | approved | rejected | returned | skipped
    status      text        NOT NULL DEFAULT 'pending',
    decided_by  uuid,                   -- identity.users.id
    decided_at  timestamptz,
    notes       text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, step_order)
);

CREATE INDEX approval_step_position_idx
    ON approval.approval_step (position_id, status)
    WHERE status = 'pending';

-- +goose Down
DROP TABLE approval.approval_step;
DROP TABLE approval.approval_request;
