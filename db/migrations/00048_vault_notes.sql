-- +goose Up
-- Private personal notes in the vault — only the owning user can see them.

CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE vault.note (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    title      text        NOT NULL DEFAULT '',
    body       text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_note_user ON vault.note (user_id, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS vault.note;
DROP SCHEMA IF EXISTS vault;
