-- +goose Up
-- Migration 00075 seeded bank accounts against the first subsidiary by
-- creation date (Page Capital Limited), but the live accounts belong to
-- Page Asset Management Limited. This corrects the subsidiary_id on all
-- affected rows by matching on GL code under Page Capital Limited.
--
-- The GT/GTBank account (0002987653) under Page Group Shared Services is
-- untouched — it was not inserted by migration 00075.

UPDATE reconciliation.bank_account
SET    subsidiary_id = (
    SELECT id FROM organization.subsidiary
    WHERE  name = 'Page Asset Management Limited'
    LIMIT  1
)
WHERE  subsidiary_id = (
    SELECT id FROM organization.subsidiary
    WHERE  name = 'Page Capital Limited'
    LIMIT  1
)
AND    gl_account_code IN (
    '1110',  -- GTBank – Main
    '1112',  -- FSDH Bank – Main
    '1113',  -- Providus Bank – Main
    '1114',  -- Providus Bank – Operations
    '1121',  -- Access Bank – Client Account
    '1122',  -- FSDH Bank – Clients (New)
    '1123',  -- Providus Bank – Client Account (NUBAN 5401732286)
    '1126',  -- Stanbic IBTC – Client Account
    '1127',  -- UBA – Client Account
    '1128',  -- Wema Bank – Clients (NUBAN 0124977578)
    '1129',  -- Zenith Bank – Client Account
    '1135',  -- RMB Nominee – NGN
    '1136'   -- UBA Nominee – NGN
);

-- +goose Down
UPDATE reconciliation.bank_account
SET    subsidiary_id = (
    SELECT id FROM organization.subsidiary
    WHERE  name = 'Page Capital Limited'
    LIMIT  1
)
WHERE  subsidiary_id = (
    SELECT id FROM organization.subsidiary
    WHERE  name = 'Page Asset Management Limited'
    LIMIT  1
)
AND    gl_account_code IN (
    '1110','1112','1113','1114','1121','1122','1123',
    '1126','1127','1128','1129','1135','1136'
);
