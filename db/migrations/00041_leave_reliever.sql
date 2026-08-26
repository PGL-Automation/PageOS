-- +goose Up
ALTER TABLE hr.leave_request
    ADD COLUMN reliever_person_id     uuid REFERENCES organization.person(id),
    ADD COLUMN handover_document_id   uuid REFERENCES documents.document(id);

-- +goose Down
ALTER TABLE hr.leave_request
    DROP COLUMN IF EXISTS reliever_person_id,
    DROP COLUMN IF EXISTS handover_document_id;
