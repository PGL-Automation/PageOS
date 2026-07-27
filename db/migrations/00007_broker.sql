-- +goose Up
-- Broker registry. Brokers are external parties who introduce clients.
-- Commission is stored as integer basis points (e.g. 150 = 1.50%) to
-- avoid floating-point errors in financial calculations.

CREATE TABLE onboarding.broker (
    id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id       uuid    NOT NULL,   -- organization.subsidiary (cross-schema ref)
    code                text    NOT NULL,
    name                text    NOT NULL,
    type                text    NOT NULL DEFAULT 'individual', -- individual | corporate
    email               text    NOT NULL DEFAULT '',
    phone               text    NOT NULL DEFAULT '',
    commission_rate_bps integer NOT NULL DEFAULT 0,
    status              text    NOT NULL DEFAULT 'active',     -- active | inactive
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, code)
);

-- +goose Down
DROP TABLE onboarding.broker;
