-- +goose Up
-- Case notes: WM follow-up log per onboarding case.
-- Allows wealth managers to record interactions with clients and compliance.

CREATE TABLE onboarding.case_note (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     uuid        NOT NULL REFERENCES onboarding.onboarding_case(id) ON DELETE CASCADE,
    author_id   uuid        NOT NULL,                   -- identity.users.id, cross-schema ref, no FK
    note_type   text        NOT NULL DEFAULT 'internal', -- internal | client | compliance
    content     text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_note_case_id  ON onboarding.case_note(case_id);
CREATE INDEX idx_case_note_author   ON onboarding.case_note(author_id);

-- +goose Down
DROP TABLE onboarding.case_note;
