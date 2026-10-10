-- +goose Up
-- Rule-based auto-classifier for unmatched bank statement lines.
-- Rules are tested in priority order (lower = higher priority); first match wins.

CREATE TABLE IF NOT EXISTS reconciliation.classification_rule (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    priority           int         NOT NULL DEFAULT 100,
    name               text        NOT NULL,
    narration_pattern  text        NOT NULL, -- ILIKE pattern, e.g. '%COMMISSION%'
    direction          text,                 -- 'credit_in_bank' | 'debit_in_bank' | NULL (any)
    amount_max_kobo    bigint,               -- optional upper bound filter
    amount_min_kobo    bigint,               -- optional lower bound filter
    posting_type       text        NOT NULL  REFERENCES reconciliation.posting_type(code),
    dr_gl_code         text        NOT NULL, -- 'BANK' = the bank account being reconciled
    cr_gl_code         text        NOT NULL,
    notes              text        NOT NULL DEFAULT '',
    is_active          boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cls_rule_priority_idx ON reconciliation.classification_rule (priority) WHERE is_active;

-- ── Seed rules for Page Asset Management / Providus bank statement ─────────────
-- Priority 5  — very specific investment instrument names
-- Priority 10 — investment transactions
-- Priority 20 — interest
-- Priority 30 — bank charges (commissions, fees, VAT)
-- Priority 40 — client inflows / outflows
-- Priority 50 — settlement, intercompany, other

INSERT INTO reconciliation.classification_rule
    (priority, name, narration_pattern, direction, posting_type, dr_gl_code, cr_gl_code, notes)
VALUES

-- ── Priority 5 — Penal / panel charge income ─────────────────────────────────
(5, 'Panel Charge Income',
 '%PANEL CHARGE%', 'credit_in_bank',
 'penal_charge_income', 'BANK', '4024',
 'Auto: panel charge income credited to account'),

(5, 'Penal Charge Income',
 '%PENAL CHARGE%', 'credit_in_bank',
 'penal_charge_income', 'BANK', '4024',
 'Auto: penal charge income credited to account'),

-- ── Priority 10 — Investment instruments ─────────────────────────────────────
(10, 'Time Deposit Creation',
 '%ADD A TIME DEPOSIT%', 'debit_in_bank',
 'time_deposit', '1203', 'BANK',
 'Auto: time deposit created at bank — DR Fixed Placement, CR Bank'),

(10, 'Fixed Deposit Placement',
 '%FIXED DEPOSIT PLACEMENT%', 'debit_in_bank',
 'investment_placement', '1202', 'BANK',
 'Auto: fixed deposit placed with counterparty — DR Fixed Placement, CR Bank'),

(10, 'Premature Settlement (Time Deposit)',
 '%PREMATURE SETTLE OF TIME DEP%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: premature liquidation of time deposit — DR Bank, CR Fixed Placement'),

(10, 'Premature Settlement',
 '%PREMATURE SETTLE%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: premature settlement received — DR Bank, CR Fixed Placement'),

(10, 'Matured Settlement',
 '%MATURED SETTLE%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: matured investment settlement received — DR Bank, CR Fixed Placement'),

(10, 'Investment Liquidation',
 '%LIQUIDATION OF MATURED%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: liquidation of matured investment — DR Bank, CR Fixed Placement'),

(10, 'Part Liquidation',
 '%PART - LIQ%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: part-liquidation of investment — DR Bank, CR Fixed Placement'),

(10, 'Pre-Liquidation',
 '%PRE-LIQ%', 'credit_in_bank',
 'investment_maturity', 'BANK', '1202',
 'Auto: pre-liquidation of investment — DR Bank, CR Fixed Placement'),

(10, 'Treasury Bill Purchase',
 '%TREASURY BILL%', 'debit_in_bank',
 'tbill_purchase', '1203', 'BANK',
 'Auto: Treasury Bill purchase — DR Treasury Bills, CR Bank'),

(10, 'Commercial Paper Purchase',
 '%COMMERCIAL PAPER%', 'debit_in_bank',
 'cp_purchase', '1219', 'BANK',
 'Auto: Commercial Paper purchase — DR Commercial Paper, CR Bank'),

(10, 'Short-Term Fixed Placement',
 '%SHORT TERM%PLACEMENT%', 'debit_in_bank',
 'st_fixed_placement', '1210', 'BANK',
 'Auto: short-term fixed placement — DR ST Fixed Placement, CR Bank'),

-- ── Priority 20 — Interest ────────────────────────────────────────────────────
(20, 'Interest Payout to Client',
 '%INTEREST PAYOUT%', 'debit_in_bank',
 'interest_payout', '2115', 'BANK',
 'Auto: interest paid to client — DR Interest Expense Payable Fund I, CR Bank'),

(20, 'Monthly Interest Payout',
 '%MONTHLY INTEREST%', 'debit_in_bank',
 'interest_payout', '2115', 'BANK',
 'Auto: monthly interest payout to client — DR Interest Expense Payable Fund I, CR Bank'),

(20, 'Investment Interest Received',
 '%INTEREST ON MATURED%', 'credit_in_bank',
 'investment_interest_received', 'BANK', '4020',
 'Auto: interest received on matured investment — DR Bank, CR Interest Income on Fixed Placement'),

(20, 'Call Placement Interest',
 '%INTEREST ON CALL%', 'credit_in_bank',
 'call_interest_received', 'BANK', '4016',
 'Auto: interest on call account — DR Bank, CR Interest Income on Call Placement'),

-- ── Priority 30 — Bank charges ────────────────────────────────────────────────
(30, 'Commission',
 '%COMMISSION%', 'debit_in_bank',
 'commission', '5706', 'BANK',
 'Auto: commission on bank transaction — DR Commission Expenses, CR Bank'),

(30, 'Stamp Duty',
 '%STAMP DUTY%', 'debit_in_bank',
 'stamp_duty', '5700', 'BANK',
 'Auto: stamp duty on bank transaction — DR Bank Charges, CR Bank'),

(30, 'VAT on Transaction',
 'VAT %', 'debit_in_bank',
 'vat_charge', '5291', 'BANK',
 'Auto: VAT on bank transaction — DR VAT Expense, CR Bank'),

(30, 'VAT on Commission',
 '%VAT %', 'debit_in_bank',
 'vat_charge', '5291', 'BANK',
 'Auto: VAT charged on commission/fee — DR VAT Expense, CR Bank'),

(30, 'SMS Alert Charge',
 '%SMS ALERT%', 'debit_in_bank',
 'bank_charge', '5700', 'BANK',
 'Auto: SMS alert fee — DR Bank Charges, CR Bank'),

(30, 'Bank Maintenance Fee',
 '%MAINTENANCE FEE%', 'debit_in_bank',
 'bank_charge', '5700', 'BANK',
 'Auto: account maintenance fee — DR Bank Charges, CR Bank'),

(30, 'Bank Charges',
 '%BANK CHARGES%', 'debit_in_bank',
 'bank_charge', '5700', 'BANK',
 'Auto: bank charges — DR Bank Charges, CR Bank'),

(30, 'NIP Fee',
 '%NIP FEE%', 'debit_in_bank',
 'bank_charge', '5700', 'BANK',
 'Auto: NIP transfer fee — DR Bank Charges, CR Bank'),

(30, 'NIBSS Fee',
 '%NIBSS%', 'debit_in_bank',
 'bank_charge', '5700', 'BANK',
 'Auto: NIBSS transaction fee — DR Bank Charges, CR Bank'),

-- ── Priority 40 — Client inflows / outflows ───────────────────────────────────
(40, 'Inward Transfer (Client Deposit)',
 '%INWARD TRANSFER%', 'credit_in_bank',
 'customer_deposit', 'BANK', '2110',
 'Auto: client deposit received — DR Bank, CR Client Funds Payable (select specific client)'),

(40, 'NEFT/RTGS Inward (Client Deposit)',
 '%NEFT%', 'credit_in_bank',
 'customer_deposit', 'BANK', '2110',
 'Auto: NEFT inward — DR Bank, CR Client Funds Payable'),

(40, 'Outward Transfer (Client Redemption)',
 '%OUTWARD TRANSFER%', 'debit_in_bank',
 'customer_redemption', '2110', 'BANK',
 'Auto: client redemption/withdrawal — DR Client Funds Payable, CR Bank (select specific client)'),

(40, 'Fee Income (Inward)',
 '%FEES%', 'credit_in_bank',
 'fee_income', 'BANK', '4001',
 'Auto: fee income received — DR Bank, CR Management Fee Income'),

-- ── Priority 50 — Settlement / intercompany / other ──────────────────────────
(50, 'CSCS/NGX Settlement',
 '%SETTLEMENT TRANSACTIONS%', 'credit_in_bank',
 'cscs_settlement', 'BANK', '2150',
 'Auto: CSCS/NGX securities settlement — DR Bank, CR Suspense Account'),

(50, 'CSCS Reference',
 '%CSCS%', 'credit_in_bank',
 'cscs_settlement', 'BANK', '2150',
 'Auto: CSCS clearing — DR Bank, CR Suspense Account'),

(50, 'Fund Placement Booking (Outward)',
 '%FUND PLACEMENT BOOKING%', 'debit_in_bank',
 'investment_placement', '1202', 'BANK',
 'Auto: fund placement booking — DR Fixed Placement, CR Bank'),

(50, 'Own Account Transfer Out',
 '%OWN ACCOUNT TRANSFER%', 'debit_in_bank',
 'intercompany_out', '2190', 'BANK',
 'Auto: own account transfer out — DR Other Payables, CR Bank'),

(50, 'Own Account Transfer In',
 '%OWN ACCOUNT TRANSFER%', 'credit_in_bank',
 'intercompany_in', 'BANK', '2190',
 'Auto: own account transfer in — DR Bank, CR Other Payables'),

(50, 'Reversal – Bank Charges',
 '%RVS_BANK CHARGES%', 'credit_in_bank',
 'bank_charge_reversal', 'BANK', '5700',
 'Auto: reversal of bank charges — DR Bank, CR Bank Charges'),

(50, 'Bank Charge Reversal',
 '%REVERSAL%CHARGE%', 'credit_in_bank',
 'bank_charge_reversal', 'BANK', '5700',
 'Auto: bank charge reversal — DR Bank, CR Bank Charges');

-- +goose Down
DROP TABLE IF EXISTS reconciliation.classification_rule;
