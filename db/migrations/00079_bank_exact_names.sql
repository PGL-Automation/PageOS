-- +goose Up
-- Update finance.account and reconciliation.bank_account names to exactly
-- match the deliberate naming convention provided by operations.

-- ── finance.account names ─────────────────────────────────────────────────────
UPDATE finance.account SET name = 'Zenith Bank Account - Client'          WHERE code = '1129';
UPDATE finance.account SET name = 'Wema - Clients (Executed only)'        WHERE code = '1128';
UPDATE finance.account SET name = 'UBA NOM - USD'                         WHERE code = '1137';
UPDATE finance.account SET name = 'UBA NOM/PAGE ASSET(DISC)-PIFSL'        WHERE code = '1138';
UPDATE finance.account SET name = 'UBA NOM/PAGE ASSET(DISC)-PCL'          WHERE code = '1139';
UPDATE finance.account SET name = 'UBA NOM - NGN'                         WHERE code = '1136';
UPDATE finance.account SET name = 'UBA Account - Client'                  WHERE code = '1127';
UPDATE finance.account SET name = 'Stanbic Bank Account - Client'         WHERE code = '1126';
UPDATE finance.account SET name = 'RMB NOM - NGN'                         WHERE code = '1135';
UPDATE finance.account SET name = 'Providus Bank Account - Operation'     WHERE code = '1114';
UPDATE finance.account SET name = 'Providus Bank Account - Client'        WHERE code = '1123';
UPDATE finance.account SET name = 'Providus Bank - Main'                  WHERE code = '1113';
UPDATE finance.account SET name = 'Gtbank Account - Main'                 WHERE code = '1110';
UPDATE finance.account SET name = 'FSDH BANK-MAIN'                        WHERE code = '1112';
UPDATE finance.account SET name = 'FSDH BANK - Clients (New)'             WHERE code = '1122';
UPDATE finance.account SET name = 'Access Bank Account - Client'          WHERE code = '1121';
UPDATE finance.account SET name = 'UBA Call Account'                      WHERE code = '1118';
UPDATE finance.account SET name = 'GLOBUS BANK'                           WHERE code = '1115';
UPDATE finance.account SET name = 'GLOBUS BANK_Settlement'                WHERE code = '1116';
UPDATE finance.account SET name = 'ABBEY MORTGAGE BANK.'                  WHERE code = '1117';
UPDATE finance.account SET name = 'GTBANK ACCOUNT - OPERATION'            WHERE code = '1111';
UPDATE finance.account SET name = 'PROVIDUS BANK-HIGH YIELD CLIENTS'      WHERE code = '1125';
UPDATE finance.account SET name = 'PROVIDUS - PPL/PAGE-I-INVEST'          WHERE code = '1124';
UPDATE finance.account SET name = 'RMB Prop Account'                      WHERE code = '1140';

-- ── reconciliation.bank_account names ────────────────────────────────────────
UPDATE reconciliation.bank_account SET account_name = 'Zenith Bank Account - Client'      WHERE gl_account_code = '1129';
UPDATE reconciliation.bank_account SET account_name = 'Wema - Clients (Executed only)'    WHERE gl_account_code = '1128';
UPDATE reconciliation.bank_account SET account_name = 'UBA NOM - USD'                     WHERE gl_account_code = '1137';
UPDATE reconciliation.bank_account SET account_name = 'UBA NOM/PAGE ASSET(DISC)-PIFSL'   WHERE gl_account_code = '1138';
UPDATE reconciliation.bank_account SET account_name = 'UBA NOM/PAGE ASSET(DISC)-PCL'     WHERE gl_account_code = '1139';
UPDATE reconciliation.bank_account SET account_name = 'UBA NOM - NGN'                     WHERE gl_account_code = '1136';
UPDATE reconciliation.bank_account SET account_name = 'UBA Account - Client'              WHERE gl_account_code = '1127';
UPDATE reconciliation.bank_account SET account_name = 'Stanbic Bank Account - Client'    WHERE gl_account_code = '1126';
UPDATE reconciliation.bank_account SET account_name = 'RMB NOM - NGN'                     WHERE gl_account_code = '1135';
UPDATE reconciliation.bank_account SET account_name = 'Providus Bank Account - Operation' WHERE gl_account_code = '1114';
UPDATE reconciliation.bank_account SET account_name = 'Providus Bank Account - Client'   WHERE gl_account_code = '1123';
UPDATE reconciliation.bank_account SET account_name = 'Providus Bank - Main'              WHERE gl_account_code = '1113';
UPDATE reconciliation.bank_account SET account_name = 'Gtbank Account - Main'            WHERE gl_account_code = '1110';
UPDATE reconciliation.bank_account SET account_name = 'FSDH BANK-MAIN'                   WHERE gl_account_code = '1112';
UPDATE reconciliation.bank_account SET account_name = 'FSDH BANK - Clients (New)'        WHERE gl_account_code = '1122';
UPDATE reconciliation.bank_account SET account_name = 'Access Bank Account - Client'     WHERE gl_account_code = '1121';
UPDATE reconciliation.bank_account SET account_name = 'UBA Call Account'                  WHERE gl_account_code = '1118';
UPDATE reconciliation.bank_account SET account_name = 'GLOBUS BANK'                      WHERE gl_account_code = '1115';
UPDATE reconciliation.bank_account SET account_name = 'GLOBUS BANK_Settlement'           WHERE gl_account_code = '1116';
UPDATE reconciliation.bank_account SET account_name = 'ABBEY MORTGAGE BANK.'             WHERE gl_account_code = '1117';
UPDATE reconciliation.bank_account SET account_name = 'GTBANK ACCOUNT - OPERATION'       WHERE gl_account_code = '1111';
UPDATE reconciliation.bank_account SET account_name = 'PROVIDUS BANK-HIGH YIELD CLIENTS' WHERE gl_account_code = '1125';
UPDATE reconciliation.bank_account SET account_name = 'PROVIDUS - PPL/PAGE-I-INVEST'     WHERE gl_account_code = '1124';
UPDATE reconciliation.bank_account SET account_name = 'RMB Prop Account'                 WHERE gl_account_code = '1140';

-- +goose Down
-- Revert to PageOS-generic names (abbreviated — full revert not practical)
UPDATE finance.account SET name = 'Zenith Bank – Client Account'          WHERE code = '1129';
UPDATE finance.account SET name = 'Wema Bank – Clients (Executed Only)'   WHERE code = '1128';
UPDATE finance.account SET name = 'UBA Nominee – USD'                      WHERE code = '1137';
UPDATE finance.account SET name = 'UBA Nominee – PIFSL'                    WHERE code = '1138';
UPDATE finance.account SET name = 'UBA Nominee – PCL'                      WHERE code = '1139';
UPDATE finance.account SET name = 'UBA Nominee – NGN'                      WHERE code = '1136';
UPDATE finance.account SET name = 'UBA – Client Account'                   WHERE code = '1127';
UPDATE finance.account SET name = 'Stanbic Bank – Client Account'          WHERE code = '1126';
UPDATE finance.account SET name = 'RMB Nominee – NGN'                      WHERE code = '1135';
UPDATE finance.account SET name = 'Providus Bank – Operations'             WHERE code = '1114';
UPDATE finance.account SET name = 'Providus Bank – Client Account'         WHERE code = '1123';
UPDATE finance.account SET name = 'Providus Bank – Main'                   WHERE code = '1113';
UPDATE finance.account SET name = 'GTBank Account – Main'                  WHERE code = '1110';
UPDATE finance.account SET name = 'FSDH Bank – Main'                       WHERE code = '1112';
UPDATE finance.account SET name = 'FSDH Bank – Clients (New)'              WHERE code = '1122';
UPDATE finance.account SET name = 'Access Bank – Client Account'           WHERE code = '1121';
UPDATE finance.account SET name = 'UBA Call Account'                       WHERE code = '1118';
UPDATE finance.account SET name = 'Globus Bank'                            WHERE code = '1115';
UPDATE finance.account SET name = 'Globus Bank – Settlement'               WHERE code = '1116';
UPDATE finance.account SET name = 'Abbey Mortgage Bank'                    WHERE code = '1117';
UPDATE finance.account SET name = 'GTBank Account – Operations'            WHERE code = '1111';
UPDATE finance.account SET name = 'Providus Bank – High Yield Clients'     WHERE code = '1125';
UPDATE finance.account SET name = 'Providus Bank – PPL / Page-I-Invest'   WHERE code = '1124';
UPDATE finance.account SET name = 'RMB Property Account'                   WHERE code = '1140';
