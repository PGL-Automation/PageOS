-- +goose Up

-- De-dup guard for in-app notifications that have no entity_id (e.g. cycle-level
-- or role-level notifications). Prevents the same notification type from being
-- inserted more than once per user per calendar day when entity_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_daily_dedup_null_entity
    ON notification.in_app (user_id, type, created_date)
    WHERE entity_id IS NULL;

-- +goose Down
DROP INDEX IF EXISTS notification.idx_in_app_daily_dedup_null_entity;
