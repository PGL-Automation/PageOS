-- name: InsertDocument :one
INSERT INTO documents.document
    (uploaded_by, storage_key, filename, mime_type, size_bytes, checksum, scan_status, context)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetDocument :one
SELECT * FROM documents.document WHERE id = $1;

-- name: UpdateScanStatus :one
UPDATE documents.document
SET scan_status = $2
WHERE id = $1
RETURNING *;
