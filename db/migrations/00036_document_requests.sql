-- +goose Up
-- Employee document request system: HR requests specific documents from staff,
-- employees upload them, status is tracked end-to-end.

CREATE TABLE documents.document_request (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id      uuid         NOT NULL REFERENCES organization.person(id),
    requested_by   uuid         NOT NULL,          -- person_id of HR who requested
    document_type  text         NOT NULL,
    notes          text         NOT NULL DEFAULT '',
    due_date       date,
    status         text         NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','uploaded','declined')),
    document_id    uuid         REFERENCES documents.document(id),
    declined_note  text         NOT NULL DEFAULT '',
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_request_person ON documents.document_request (person_id, status);
CREATE INDEX idx_doc_request_requester ON documents.document_request (requested_by);

-- +goose Down
DROP TABLE IF EXISTS documents.document_request;
