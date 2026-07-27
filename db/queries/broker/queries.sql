-- name: CreateBroker :one
INSERT INTO onboarding.broker
    (subsidiary_id, code, name, type, email, phone, commission_rate_bps)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetBroker :one
SELECT * FROM onboarding.broker WHERE id = $1;

-- name: GetBrokerByCode :one
SELECT * FROM onboarding.broker
WHERE subsidiary_id = $1 AND code = $2;

-- name: ListBrokers :many
SELECT * FROM onboarding.broker
WHERE subsidiary_id = $1
ORDER BY name;

-- name: UpdateBrokerCommission :one
UPDATE onboarding.broker
SET commission_rate_bps = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateBrokerStatus :one
UPDATE onboarding.broker
SET status = $2, updated_at = now()
WHERE id = $1
RETURNING *;
