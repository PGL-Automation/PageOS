-- +goose Up
-- Update posting type DR/CR codes to use Phase 2 COA accounts,
-- and add missing transaction types for Page Asset Management operations.

-- ── Update existing posting type GL codes ─────────────────────────────────────

-- Interest Payout to Client: was DR 2102 (Accrued Expenses)
-- → now DR 2115 (Interest Expense Payable – Fund I)
UPDATE reconciliation.posting_type
SET    dr_gl_code = '2115',
       description = 'Interest paid to client on their deposit/investment — DR Interest Expense Payable Fund I, CR Bank'
WHERE  code = 'interest_payout';

-- Investment Placement (FD / CP): was DR 1202 — now correct after Phase 2 rename
-- Update description to clarify GL
UPDATE reconciliation.posting_type
SET    description = 'Funds placed as a Fixed Deposit or Commercial Paper — DR Fixed Placement, CR Bank'
WHERE  code = 'investment_placement';

-- Money Market Placement: DR 1203 = Treasury Bills — correct after Phase 2
UPDATE reconciliation.posting_type
SET    description = 'Funds placed in Treasury Bills or other money market instruments — DR Treasury Bills, CR Bank'
WHERE  code = 'investment_money_market';

-- Time Deposit Creation: now use 1217 (Fixed Placement – Providus Bank) for Providus TDs
-- Keep 1203 as default since time deposits vary by bank; user can override
UPDATE reconciliation.posting_type
SET    description = 'Funds moved into a time deposit product at the same bank — DR Fixed Placement, CR Bank'
WHERE  code = 'time_deposit';

-- CSCS Settlement: CR 2150 (Suspense) — correct, update description
UPDATE reconciliation.posting_type
SET    description = 'Settlement inflow from CSCS or NGX securities clearing — DR Bank, CR Suspense Account'
WHERE  code = 'cscs_settlement';

-- Fee / Panel Charge Income: CR 4090 — update to 4024 (Penal Charge Income)
-- Split into two types — keep fee_income for management/advisory fees (CR 4001),
-- add new type for penal charges (CR 4024)
UPDATE reconciliation.posting_type
SET    cr_gl_code  = '4001',
       label       = 'Fee Income Received',
       description = 'Management fee, advisory fee or fund administration income — DR Bank, CR Management Fee Income'
WHERE  code = 'fee_income';

-- Investment Maturity / Liquidation: CR 1202 — correct after Phase 2
UPDATE reconciliation.posting_type
SET    description = 'Principal and interest received from matured FD or CP — DR Bank, CR Fixed Placement'
WHERE  code = 'investment_maturity';

-- ── Add missing transaction types ─────────────────────────────────────────────

INSERT INTO reconciliation.posting_type
    (code, label, description, dr_gl_code, cr_gl_code, direction)
VALUES

-- Penal / panel charge income (separate from management fee income)
('penal_charge_income',
 'Penal / Panel Charge Income',
 'Penal charge or panel income credited to bank — DR Bank, CR Penal Charge Income',
 'BANK', '4024', 'credit_in_bank'),

-- Interest received FROM investment counterparty (not payout to client)
('investment_interest_received',
 'Investment Interest Received',
 'Interest income received from FD, CP or T-Bill counterparty — DR Bank, CR Interest Income on Fixed Placement',
 'BANK', '4020', 'credit_in_bank'),

-- T-Bill interest received
('tbill_interest_received',
 'Treasury Bill Interest Received',
 'Discount/interest received on Treasury Bills — DR Bank, CR Interest Income on Treasury Bill',
 'BANK', '4010', 'credit_in_bank'),

-- Bond interest / coupon received
('bond_interest_received',
 'Bond Interest / Coupon Received',
 'Coupon or interest received on bond holdings — DR Bank, CR Interest Income on Bond',
 'BANK', '4012', 'credit_in_bank'),

-- Commercial paper interest received
('cp_interest_received',
 'Commercial Paper Interest Received',
 'Interest received on Commercial Paper — DR Bank, CR Interest Income on Commercial Papers',
 'BANK', '4021', 'credit_in_bank'),

-- Call account interest received
('call_interest_received',
 'Call Account Interest Received',
 'Interest received on bank call / nostro account — DR Bank, CR Interest Income on Call Placement',
 'BANK', '4016', 'credit_in_bank'),

-- Dividend received
('dividend_received',
 'Dividend Received',
 'Dividend income received from equity holdings — DR Bank, CR Dividend Income',
 'BANK', '4011', 'credit_in_bank'),

-- Gain on disposal of investment / equity
('gain_on_disposal',
 'Gain on Disposal of Investment',
 'Proceeds from sale of equity or AFS instrument — DR Bank, CR Gain on Sales of Shares',
 'BANK', '4013', 'credit_in_bank'),

-- WHT / tax refund received
('wht_refund',
 'WHT / Tax Refund Received',
 'Withholding tax credit or refund received — DR Bank, CR Withholding Tax Receivable',
 'BANK', '1150', 'credit_in_bank'),

-- Outward: T-Bill purchase (distinct from generic money market)
('tbill_purchase',
 'Treasury Bill Purchase',
 'Purchase of Treasury Bills — DR Treasury Bills, CR Bank',
 '1203', 'BANK', 'debit_in_bank'),

-- Outward: Short-term fixed placement
('st_fixed_placement',
 'Short-Term Fixed Placement',
 'Short-term fixed deposit placement — DR Fixed Placement Short Term, CR Bank',
 '1210', 'BANK', 'debit_in_bank'),

-- Outward: Commercial paper purchase
('cp_purchase',
 'Commercial Paper Purchase',
 'Purchase of a Commercial Paper — DR Commercial Paper, CR Bank',
 '1219', 'BANK', 'debit_in_bank'),

-- Outward: Equity purchase
('equity_purchase',
 'Equity Purchase',
 'Purchase of equities or FVTPL instruments — DR Equity Trading/FVTPL, CR Bank',
 '1201', 'BANK', 'debit_in_bank'),

-- Stamp duty / VAT on transactions (specific bank charge sub-types)
('stamp_duty',
 'Stamp Duty',
 'Stamp duty charged on bank transaction — DR Bank Charges, CR Bank',
 '5700', 'BANK', 'debit_in_bank'),

('commission',
 'Commission / Transaction Fee',
 'Commission charged on outward transfer — DR Commission Expenses, CR Bank',
 '5706', 'BANK', 'debit_in_bank'),

('vat_charge',
 'VAT on Bank Transaction',
 'VAT charged by bank on commissions/fees — DR VAT Expense, CR Bank',
 '5291', 'BANK', 'debit_in_bank')

ON CONFLICT (code) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    dr_gl_code  = EXCLUDED.dr_gl_code,
    cr_gl_code  = EXCLUDED.cr_gl_code,
    direction   = EXCLUDED.direction;

-- +goose Down
DELETE FROM reconciliation.posting_type WHERE code IN (
    'penal_charge_income','investment_interest_received','tbill_interest_received',
    'bond_interest_received','cp_interest_received','call_interest_received',
    'dividend_received','gain_on_disposal','wht_refund',
    'tbill_purchase','st_fixed_placement','cp_purchase','equity_purchase',
    'stamp_duty','commission','vat_charge'
);
-- Revert modified types
UPDATE reconciliation.posting_type SET dr_gl_code='2102' WHERE code='interest_payout';
UPDATE reconciliation.posting_type SET cr_gl_code='4090', label='Fee / Panel Charge Income' WHERE code='fee_income';
