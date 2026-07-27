-- name: CreateUser :one
INSERT INTO identity.users (email, password_hash, display_name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM identity.users
WHERE lower(email) = lower($1);

-- name: GetUserByID :one
SELECT * FROM identity.users
WHERE id = $1;

-- name: CreateSession :one
INSERT INTO identity.sessions (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSessionByTokenHash :one
SELECT * FROM identity.sessions
WHERE token_hash = $1;

-- name: RevokeSession :exec
UPDATE identity.sessions
SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL;
