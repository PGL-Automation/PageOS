-- +goose Up

-- ── Replace generic placeholder bank names with actual Page Group banks ────────
-- Update the five existing codes (1110–1114) that had wrong placeholder names.

UPDATE finance.account SET name = 'GTBank Account – Main'          WHERE code = '1110';
UPDATE finance.account SET name = 'GTBank Account – Operations'    WHERE code = '1111';
UPDATE finance.account SET name = 'FSDH Bank – Main'               WHERE code = '1112';
UPDATE finance.account SET name = 'Providus Bank – Main'           WHERE code = '1113';
UPDATE finance.account SET name = 'Providus Bank – Operations'     WHERE code = '1114';

-- ── Insert the fifteen additional bank accounts ───────────────────────────────

INSERT INTO finance.account
    (code, name, account_type, account_group, parent_code, normal_balance, is_header)
VALUES
-- Operating / company accounts
('1115', 'Globus Bank',                                'ASSET', 'Current Assets', '1100', 'DR', false),
('1116', 'Globus Bank – Settlement',                   'ASSET', 'Current Assets', '1100', 'DR', false),
('1117', 'Abbey Mortgage Bank',                        'ASSET', 'Current Assets', '1100', 'DR', false),
('1118', 'UBA Call Account',                           'ASSET', 'Current Assets', '1100', 'DR', false),

-- Client-designated accounts (sit under 1120 Client Funds – Segregated group)
('1121', 'Access Bank – Client Account',               'ASSET', 'Current Assets', '1100', 'DR', false),
('1122', 'FSDH Bank – Clients (New)',                  'ASSET', 'Current Assets', '1100', 'DR', false),
('1123', 'Providus Bank – Client Account',             'ASSET', 'Current Assets', '1100', 'DR', false),
('1124', 'Providus Bank – PPL / Page-I-Invest',        'ASSET', 'Current Assets', '1100', 'DR', false),
('1125', 'Providus Bank – High Yield Clients',         'ASSET', 'Current Assets', '1100', 'DR', false),
('1126', 'Stanbic Bank – Client Account',              'ASSET', 'Current Assets', '1100', 'DR', false),
('1127', 'UBA – Client Account',                       'ASSET', 'Current Assets', '1100', 'DR', false),
('1128', 'Wema Bank – Clients (Executed Only)',        'ASSET', 'Current Assets', '1100', 'DR', false),
('1129', 'Zenith Bank – Client Account',               'ASSET', 'Current Assets', '1100', 'DR', false),

-- Nominee / custodian accounts
('1135', 'RMB Nominee – NGN',                          'ASSET', 'Current Assets', '1100', 'DR', false),
('1136', 'UBA Nominee – NGN',                          'ASSET', 'Current Assets', '1100', 'DR', false)

ON CONFLICT (code) DO NOTHING;

-- ── Fix reconciliation bank_account GL mappings ───────────────────────────────
-- Providus (0044456789): was mapped to 1114 "Access Bank" → now 1113 "Providus Bank – Main"
-- Wema   (0124977578): was mapped to 1111 "Zenith Bank"  → now 1128 "Wema Bank – Clients"

UPDATE reconciliation.bank_account
SET    gl_account_code = '1113'
WHERE  account_number  = '0044456789';

UPDATE reconciliation.bank_account
SET    gl_account_code = '1128'
WHERE  account_number  = '0124977578';

-- +goose Down

DELETE FROM finance.account
WHERE code IN ('1115','1116','1117','1118',
               '1121','1122','1123','1124','1125','1126','1127','1128','1129',
               '1135','1136');

UPDATE finance.account SET name = 'Cash at Bank – GTBank'      WHERE code = '1110';
UPDATE finance.account SET name = 'Cash at Bank – Zenith Bank' WHERE code = '1111';
UPDATE finance.account SET name = 'Cash at Bank – Stanbic IBTC' WHERE code = '1112';
UPDATE finance.account SET name = 'Cash at Bank – UBA'         WHERE code = '1113';
UPDATE finance.account SET name = 'Cash at Bank – Access Bank' WHERE code = '1114';

UPDATE reconciliation.bank_account SET gl_account_code = '1114' WHERE account_number = '0044456789';
UPDATE reconciliation.bank_account SET gl_account_code = '1111' WHERE account_number = '0124977578';
