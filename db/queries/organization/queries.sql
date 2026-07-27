-- name: CreateSubsidiary :one
INSERT INTO organization.subsidiary (code, name)
VALUES ($1, $2)
RETURNING *;

-- name: ListSubsidiaries :many
SELECT * FROM organization.subsidiary
ORDER BY name;

-- name: CreateDepartment :one
INSERT INTO organization.department (subsidiary_id, code, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreatePosition :one
INSERT INTO organization.position (subsidiary_id, department_id, code, title)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CreatePerson :one
INSERT INTO organization.person (user_id, first_name, last_name, email)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CreateAssignment :one
INSERT INTO organization.assignment
    (person_id, position_id, subsidiary_id, department_id, effective_from, effective_to, is_primary)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: EndAssignment :exec
UPDATE organization.assignment
SET effective_to = $2
WHERE id = $1;

-- GetPositionByCode looks up a position by its code within a subsidiary.
-- Used by approval routing functions to resolve position IDs.
-- name: GetPositionByCode :one
SELECT * FROM organization.position
WHERE subsidiary_id = $1 AND code = $2;

-- GetActivePositionsForUser returns the position IDs currently held by a user,
-- based on their linked person record and effective-dated assignments.
-- Used by the approval service to validate who can decide on a step.
-- name: GetActivePositionsForUser :many
SELECT a.position_id
FROM organization.assignment a
JOIN organization.person p ON p.id = a.person_id
WHERE p.user_id = $1
  AND a.effective_from <= CURRENT_DATE
  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE);

-- ResolveHolders returns the people holding a position on a given date.
-- This is the temporal resolver approval routing depends on.
-- name: ResolveHolders :many
SELECT p.*
FROM organization.assignment a
JOIN organization.person p ON p.id = a.person_id
WHERE a.position_id = $1
  AND a.effective_from <= $2
  AND (a.effective_to IS NULL OR a.effective_to >= $2);
