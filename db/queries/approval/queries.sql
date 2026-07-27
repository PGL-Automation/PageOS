-- name: CreateApprovalRequest :one
INSERT INTO approval.approval_request (resource_type, resource_id, routing_key, context, created_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetApprovalRequest :one
SELECT * FROM approval.approval_request WHERE id = $1;

-- name: GetApprovalRequestForResource :one
SELECT * FROM approval.approval_request
WHERE resource_type = $1 AND resource_id = $2
ORDER BY created_at DESC
LIMIT 1;

-- name: UpdateApprovalRequestStatus :one
UPDATE approval.approval_request
SET status = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateApprovalStep :one
INSERT INTO approval.approval_step (request_id, step_order, position_id, label, status)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListApprovalSteps :many
SELECT * FROM approval.approval_step
WHERE request_id = $1
ORDER BY step_order;

-- name: GetApprovalStep :one
SELECT * FROM approval.approval_step WHERE id = $1;

-- name: RecordStepDecision :one
UPDATE approval.approval_step
SET status = $2, decided_by = $3, decided_at = now(), notes = $4
WHERE id = $1
RETURNING *;

-- GetNextPendingStep returns the lowest-order pending step for a request.
-- name: GetNextPendingStep :one
SELECT * FROM approval.approval_step
WHERE request_id = $1 AND status = 'pending'
ORDER BY step_order
LIMIT 1;

-- GetPendingStepsForPositions returns pending steps the caller can act on,
-- given the list of position IDs they currently hold.
-- name: GetPendingStepsForPositions :many
SELECT s.*, r.resource_type, r.resource_id, r.context AS request_context
FROM approval.approval_step s
JOIN approval.approval_request r ON r.id = s.request_id
WHERE s.position_id = ANY($1::uuid[])
  AND s.status = 'pending'
ORDER BY s.created_at;
