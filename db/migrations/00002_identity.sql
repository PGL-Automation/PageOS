-- +goose Up
-- Identity module: staff user accounts + server-side sessions.
-- Auth is in-house (argon2id); roles/positions come from the organization
-- module, not from here. See docs/onboarding-slice-plan.md §11.

CREATE TABLE identity.users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text        NOT NULL,
    password_hash text        NOT NULL,
    display_name  text        NOT NULL DEFAULT '',
    status        text        NOT NULL DEFAULT 'active', -- active | disabled
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on email.
CREATE UNIQUE INDEX users_email_lower_idx ON identity.users (lower(email));

CREATE TABLE identity.sessions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    token_hash text        NOT NULL UNIQUE, -- sha256 of the opaque session token
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE INDEX sessions_user_idx ON identity.sessions (user_id);

-- +goose Down
DROP TABLE identity.sessions;
DROP TABLE identity.users;
