-- +goose Up
-- Documents module: file metadata. Actual bytes live in object storage (S3/
-- MinIO). This table is the authoritative record of every uploaded file.

CREATE TABLE documents.document (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by  uuid        NOT NULL,          -- identity.users.id (cross-schema ref, no FK)
    storage_key  text        NOT NULL UNIQUE,   -- path in object store
    filename     text        NOT NULL,
    mime_type    text        NOT NULL,
    size_bytes   bigint      NOT NULL,
    checksum     text        NOT NULL,          -- sha256 hex of file content
    scan_status  text        NOT NULL DEFAULT 'pending', -- pending|clean|infected|error
    context      jsonb       NOT NULL DEFAULT '{}'::jsonb, -- e.g. {case_id, requirement_key}
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_uploaded_by_idx ON documents.document (uploaded_by);

-- +goose Down
DROP TABLE documents.document;
