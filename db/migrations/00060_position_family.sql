-- +goose Up
-- Add family classification to positions and departments.
-- The family field groups positions by functional domain (hr, finance, etc.)
-- and defaults to 'default' for backward compatibility.

ALTER TABLE organization.position
    ADD COLUMN family text NOT NULL DEFAULT 'default';

ALTER TABLE organization.department
    ADD COLUMN family text NOT NULL DEFAULT 'default';

-- +goose Down
ALTER TABLE organization.department DROP COLUMN family;
ALTER TABLE organization.position DROP COLUMN family;
