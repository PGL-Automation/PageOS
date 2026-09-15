-- +goose Up
-- Local reactions: stored in our DB since Graph API doesn't support setReaction
-- for all chat types (e.g. @unq.gbl.spaces format used by Teams).
CREATE TABLE msgraph.chat_reaction (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    ms_user_id    TEXT        NOT NULL DEFAULT '',  -- MS Graph user ID for display
    display_name  TEXT        NOT NULL DEFAULT '',
    chat_id       TEXT        NOT NULL,
    message_id    TEXT        NOT NULL,
    reaction_type TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, chat_id, message_id, reaction_type)
);
CREATE INDEX idx_chat_reaction_msg ON msgraph.chat_reaction(chat_id, message_id);

-- Read tracking: records when a PageOS user last read a chat, enabling
-- read receipts without relying on the Graph members API.
CREATE TABLE msgraph.chat_read (
    user_id      UUID        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    ms_user_id   TEXT        NOT NULL DEFAULT '',
    display_name TEXT        NOT NULL DEFAULT '',
    chat_id      TEXT        NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, chat_id)
);
CREATE INDEX idx_chat_read_chat ON msgraph.chat_read(chat_id);

-- +goose Down
DROP TABLE IF EXISTS msgraph.chat_reaction;
DROP TABLE IF EXISTS msgraph.chat_read;
