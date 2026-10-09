-- +goose Up
-- Full NUBAN update for all Page Asset Management bank accounts.
-- Source: confirmed account list provided by operations team, Oct 2026.

-- ── 1. Add missing GL codes for UBA nominee variants + RMB Property ───────────
INSERT INTO finance.account
    (code, name, account_type, account_group, parent_code, normal_balance, is_header)
VALUES
    ('1137', 'UBA Nominee – USD',        'ASSET', 'Current Assets', '1100', 'DR', false),
    ('1138', 'UBA Nominee – PIFSL',      'ASSET', 'Current Assets', '1100', 'DR', false),
    ('1139', 'UBA Nominee – PCL',        'ASSET', 'Current Assets', '1100', 'DR', false),
    ('1140', 'RMB Property Account',     'ASSET', 'Current Assets', '1100', 'DR', false)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name;

-- ── 2. Update NUBANs on all existing reconciliation bank accounts ─────────────
-- Matches by GL code which is the stable identifier.

UPDATE reconciliation.bank_account SET account_number = '1225726962',
    account_name = 'Page Asset Management – Zenith Client'
WHERE gl_account_code = '1129';                          -- Zenith Bank – Client

UPDATE reconciliation.bank_account SET account_number = '1025575689',
    account_name = 'Page Asset Management – UBA Nominee NGN'
WHERE gl_account_code = '1136';                          -- UBA Nominee – NGN

UPDATE reconciliation.bank_account SET account_number = '1025521260',
    account_name = 'Page Asset Management – UBA Client'
WHERE gl_account_code = '1127';                          -- UBA – Client Account

UPDATE reconciliation.bank_account SET account_number = '0047327518',
    account_name = 'Page Asset Management – Stanbic Client'
WHERE gl_account_code = '1126';                          -- Stanbic IBTC – Client

UPDATE reconciliation.bank_account SET account_number = '1000141262',
    account_name = 'Page Asset Management – RMB Nominee NGN'
WHERE gl_account_code = '1135';                          -- RMB Nominee – NGN

UPDATE reconciliation.bank_account SET account_number = '5401709686',
    account_name = 'Page Asset Management – Providus Operations'
WHERE gl_account_code = '1114';                          -- Providus – Operations

UPDATE reconciliation.bank_account SET account_number = '5400941027',
    account_name = 'Page Asset Management – Providus Main'
WHERE gl_account_code = '1113';                          -- Providus – Main (was wrong NUBAN)

UPDATE reconciliation.bank_account SET account_number = '0012273235',
    account_name = 'Page Asset Management – GTBank Main'
WHERE gl_account_code = '1110';                          -- GTBank – Main

UPDATE reconciliation.bank_account SET account_number = '1000137033',
    account_name = 'Page Asset Management – FSDH Main'
WHERE gl_account_code = '1112';                          -- FSDH Bank – Main

UPDATE reconciliation.bank_account SET account_number = '1000143331',
    account_name = 'Page Asset Management – FSDH Clients'
WHERE gl_account_code = '1122';                          -- FSDH Bank – Clients (New)

UPDATE reconciliation.bank_account SET account_number = '1679509005',
    account_name = 'Page Asset Management – Access Client'
WHERE gl_account_code = '1121';                          -- Access Bank – Client

UPDATE reconciliation.bank_account SET account_number = '3004547805',
    account_name = 'Page Asset Management – UBA Call Account'
WHERE gl_account_code = '1118';                          -- UBA Call Account

-- ── 3. Seed accounts that had GL codes but no reconciliation record yet ────────

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'GTBank', '0762700638', 'Page Asset Management – GTBank Operations', 'NGN', '1111', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1111' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'Globus Bank', '1000369346', 'Page Asset Management – Globus Bank', 'NGN', '1115', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1115' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'Globus Bank', '1000369353', 'Page Asset Management – Globus Settlement', 'NGN', '1116', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1116' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'Abbey Mortgage Bank', '0006167693', 'Page Asset Management – Abbey Mortgage', 'NGN', '1117', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1117' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'Providus Bank', '1309544255', 'Page Asset Management – Providus PPL/I-Invest', 'NGN', '1124', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1124' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'Providus Bank', '1309188943', 'Page Asset Management – Providus High Yield Clients', 'NGN', '1125', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1125' AND sub.name = 'Page Asset Management Limited'
);

-- ── 4. New accounts (UBA nominee variants + RMB Property) ────────────────────

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'UBA', '1025575672', 'Page Asset Management – UBA Nominee USD', 'USD', '1137', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1137' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'UBA', '1026275948', 'Page Asset Management – UBA Nominee PIFSL', 'NGN', '1138', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1138' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'UBA', '1026275931', 'Page Asset Management – UBA Nominee PCL', 'NGN', '1139', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1139' AND sub.name = 'Page Asset Management Limited'
);

INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
SELECT s.id, 'RMB Bank', '1000258993', 'Page Asset Management – RMB Property Account', 'NGN', '1140', 'active'
FROM   (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1) s
WHERE  NOT EXISTS (
    SELECT 1 FROM reconciliation.bank_account ba
    JOIN   organization.subsidiary sub ON sub.id = ba.subsidiary_id
    WHERE  ba.gl_account_code = '1140' AND sub.name = 'Page Asset Management Limited'
);

-- +goose Down
DELETE FROM reconciliation.bank_account
WHERE gl_account_code IN ('1137','1138','1139','1140')
  AND subsidiary_id = (SELECT id FROM organization.subsidiary WHERE name = 'Page Asset Management Limited' LIMIT 1);

DELETE FROM finance.account WHERE code IN ('1137','1138','1139','1140');

-- Revert NUBANs to empty (data migration — cannot restore original wrong values)
UPDATE reconciliation.bank_account SET account_number = ''
WHERE gl_account_code IN ('1110','1112','1113','1114','1118',
                          '1121','1122','1126','1127','1129','1135','1136');
