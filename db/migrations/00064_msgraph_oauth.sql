-- +goose Up
-- Microsoft Graph integration: one token row per PageOS user who has connected
-- their Microsoft account. Tokens are AES-GCM encrypted before INSERT and
-- decrypted only inside the Go service layer — never stored as plaintext.

CREATE SCHEMA IF NOT EXISTS msgraph;

CREATE TABLE msgraph.user_token (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID        NOT NULL UNIQUE REFERENCES identity.users(id) ON DELETE CASCADE,
    microsoft_user_id  TEXT        NOT NULL DEFAULT '',
    microsoft_email    TEXT        NOT NULL DEFAULT '',
    access_token_enc   BYTEA       NOT NULL,
    refresh_token_enc  BYTEA       NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    scope              TEXT        NOT NULL DEFAULT '',
    connected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_msgraph_user_token_user ON msgraph.user_token(user_id);

-- +goose Down
DROP TABLE IF EXISTS msgraph.user_token;
DROP SCHEMA IF EXISTS msgraph;
