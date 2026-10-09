-- +goose Up
-- Posting-type lookup table: pre-configured DR/CR templates for each
-- transaction classification. 'BANK' is a placeholder — the actual bank
-- GL code is substituted at journal-creation time from the run's bank account.

CREATE TABLE IF NOT EXISTS reconciliation.posting_type (
    code        text PRIMARY KEY,
    label       text NOT NULL,
    description text NOT NULL DEFAULT '',
    dr_gl_code  text NOT NULL,  -- 'BANK' = the bank account being reconciled
    cr_gl_code  text NOT NULL,  -- 'BANK' = the bank account being reconciled
    direction   text NOT NULL   -- credit_in_bank | debit_in_bank | both
);

INSERT INTO reconciliation.posting_type
    (code, label, description, dr_gl_code, cr_gl_code, direction)
VALUES
-- ── Credits in bank (money arrived, GL has no entry) ─────────────────────────
('customer_deposit',
 'Client Deposit Received',
 'Client funds received into bank account — debit bank, credit Client Funds Payable',
 'BANK', '2110', 'credit_in_bank'),

('investment_maturity',
 'Investment Maturity / Liquidation',
 'Principal and interest received from a matured Fixed Deposit or CP',
 'BANK', '1202', 'credit_in_bank'),

('bank_charge_reversal',
 'Bank Charge Reversal',
 'Bank reversed a previously charged fee',
 'BANK', '5700', 'credit_in_bank'),

('fee_income',
 'Fee / Panel Charge Income',
 'Management fee, panel charge, or advisory income credited to bank',
 'BANK', '4090', 'credit_in_bank'),

('cscs_settlement',
 'CSCS / Securities Settlement',
 'Settlement inflow from CSCS or securities clearing',
 'BANK', '2150', 'credit_in_bank'),

('intercompany_in',
 'Intercompany Transfer In',
 'Transfer received from a related entity',
 'BANK', '2190', 'credit_in_bank'),

-- ── Debits in bank (money left, GL has no entry) ─────────────────────────────
('customer_redemption',
 'Client Redemption / Withdrawal',
 'Client funds paid out — debit Client Funds Payable, credit bank',
 '2110', 'BANK', 'debit_in_bank'),

('interest_payout',
 'Interest Payout to Client',
 'Interest paid to client on their investment / deposit',
 '2102', 'BANK', 'debit_in_bank'),

('bank_charge',
 'Bank Charges',
 'Commission, stamp duty, VAT, or SMS alert fee charged by bank',
 '5700', 'BANK', 'debit_in_bank'),

('investment_placement',
 'Investment Placement (FD / CP)',
 'Funds placed as a Fixed Deposit or Commercial Paper with a counterparty',
 '1202', 'BANK', 'debit_in_bank'),

('investment_money_market',
 'Money Market Placement',
 'Funds placed in a Treasury Bill or other money market instrument',
 '1203', 'BANK', 'debit_in_bank'),

('time_deposit',
 'Time Deposit Creation',
 'Funds moved into a time deposit product at the same bank',
 '1203', 'BANK', 'debit_in_bank'),

('intercompany_out',
 'Intercompany Transfer Out',
 'Transfer sent to a related entity',
 '2190', 'BANK', 'debit_in_bank'),

-- ── Either direction ──────────────────────────────────────────────────────────
('other',
 'Other (specify GL codes)',
 'Manually enter the debit and credit GL codes',
 '', '', 'both')

ON CONFLICT (code) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    dr_gl_code  = EXCLUDED.dr_gl_code,
    cr_gl_code  = EXCLUDED.cr_gl_code,
    direction   = EXCLUDED.direction;

-- ── Seed live bank accounts for Page Asset Management Limited ─────────────────
-- GL codes map to finance.account (migration 00027 + 00073).
-- Account numbers sourced from Providus bank statement and existing records.
-- Rows with empty account_number should be updated once the NUBAN is confirmed.

DO $$
DECLARE
    sid uuid;
BEGIN
    SELECT id INTO sid FROM organization.subsidiary ORDER BY created_at LIMIT 1;
    IF sid IS NULL THEN RETURN; END IF;

    -- Providus Bank – Client Account (GL0811101500 → 1123)
    -- Primary operating account; NUBAN confirmed from bank statement
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Providus Bank', '5401732286',
           'Page Asset Management – Clients', 'NGN', '1123', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1123'
    );

    -- Providus Bank – Main (GL0811101900 → 1113)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Providus Bank', '0044456789',
           'Page Asset Management – Main', 'NGN', '1113', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1113'
    );

    -- Providus Bank – Operations (GL0811101600 → 1114)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Providus Bank', '',
           'Page Asset Management – Operations', 'NGN', '1114', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1114'
    );

    -- GTBank – Main (GL0811100600 → 1110)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'GTBank', '',
           'Page Asset Management – GTBank Main', 'NGN', '1110', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1110'
    );

    -- FSDH Bank – Main (GL0811101700 → 1112)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'FSDH Bank', '',
           'Page Asset Management – FSDH Main', 'NGN', '1112', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1112'
    );

    -- FSDH Bank – Clients New (GL0811102000 → 1122)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'FSDH Bank', '',
           'Page Asset Management – FSDH Clients', 'NGN', '1122', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1122'
    );

    -- Access Bank – Client Account (GL0811101100 → 1121)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Access Bank', '',
           'Page Asset Management – Access Client', 'NGN', '1121', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1121'
    );

    -- Stanbic IBTC – Client Account (GL0811100100 → 1126)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Stanbic IBTC', '',
           'Page Asset Management – Stanbic Client', 'NGN', '1126', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1126'
    );

    -- UBA – Nominee / NGN Nostro (GL0811101300 → 1136)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'UBA', '',
           'Page Asset Management – UBA Nominee', 'NGN', '1136', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1136'
    );

    -- UBA – Client Account (GL0811100800 → 1127)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'UBA', '',
           'Page Asset Management – UBA Client', 'NGN', '1127', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1127'
    );

    -- RMB – Nominee / NGN Nostro (GL0811101400 → 1135)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'RMB Bank', '',
           'Page Asset Management – RMB Nominee', 'NGN', '1135', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1135'
    );

    -- Wema Bank – Clients Executed Only (GL0811102100 → 1128)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Wema Bank', '0124977578',
           'Page Asset Management – Wema Clients', 'NGN', '1128', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1128'
    );

    -- Zenith Bank – Client Account (GL0811100300 → 1129)
    INSERT INTO reconciliation.bank_account
        (subsidiary_id, bank_name, account_number, account_name, currency, gl_account_code, status)
    SELECT sid, 'Zenith Bank', '',
           'Page Asset Management – Zenith Client', 'NGN', '1129', 'active'
    WHERE NOT EXISTS (
        SELECT 1 FROM reconciliation.bank_account
        WHERE subsidiary_id = sid AND gl_account_code = '1129'
    );

END $$;

-- +goose Down
DROP TABLE IF EXISTS reconciliation.posting_type;
-- Bank account rows inserted by this migration are intentionally left in place
-- on down-migration to avoid data loss on production.
