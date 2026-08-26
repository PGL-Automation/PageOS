-- +goose Up
-- Chart of Accounts for Page Group (capital markets & wealth management).
-- account_type drives financial statement classification.
-- normal_balance: DR = debit-normal (assets, expenses), CR = credit-normal (liabilities, equity, revenue).
-- is_header: true = grouping node only, never directly posted to.

CREATE TABLE finance.account (
    code            text        PRIMARY KEY,
    name            text        NOT NULL,
    account_type    text        NOT NULL
                        CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    account_group   text        NOT NULL DEFAULT '',   -- e.g. "Current Assets"
    parent_code     text        REFERENCES finance.account(code),
    normal_balance  text        NOT NULL DEFAULT 'DR'
                        CHECK (normal_balance IN ('DR','CR')),
    is_header       boolean     NOT NULL DEFAULT false,
    is_active       boolean     NOT NULL DEFAULT true,
    description     text        NOT NULL DEFAULT '',
    subsidiary_id   uuid        REFERENCES organization.subsidiary(id), -- NULL = group-wide
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_type  ON finance.account (account_type);
CREATE INDEX idx_account_group ON finance.account (account_group);

-- ── Seed: Page Group standard chart of accounts ───────────────────────────────
-- Format: (code, name, account_type, account_group, parent, normal_balance, is_header)

INSERT INTO finance.account
    (code, name, account_type, account_group, parent_code, normal_balance, is_header)
VALUES

-- ╔══════════════════════════════════════════════════════╗
-- ║  1000 – ASSETS                                       ║
-- ╚══════════════════════════════════════════════════════╝
('1000', 'Assets',                          'ASSET', 'Assets',              NULL,   'DR', true),

-- Current Assets
('1100', 'Current Assets',                  'ASSET', 'Current Assets',      '1000', 'DR', true),
('1101', 'Cash and Cash Equivalents',       'ASSET', 'Current Assets',      '1100', 'DR', false),
('1102', 'Petty Cash',                      'ASSET', 'Current Assets',      '1100', 'DR', false),
('1110', 'Cash at Bank – GTBank',           'ASSET', 'Current Assets',      '1100', 'DR', false),
('1111', 'Cash at Bank – Zenith Bank',      'ASSET', 'Current Assets',      '1100', 'DR', false),
('1112', 'Cash at Bank – Stanbic IBTC',     'ASSET', 'Current Assets',      '1100', 'DR', false),
('1113', 'Cash at Bank – UBA',              'ASSET', 'Current Assets',      '1100', 'DR', false),
('1114', 'Cash at Bank – Access Bank',      'ASSET', 'Current Assets',      '1100', 'DR', false),
('1120', 'Client Funds – Segregated',       'ASSET', 'Current Assets',      '1100', 'DR', false),
('1130', 'Management Fees Receivable',      'ASSET', 'Current Assets',      '1100', 'DR', false),
('1131', 'Performance Fees Receivable',     'ASSET', 'Current Assets',      '1100', 'DR', false),
('1132', 'Brokerage Commissions Receivable','ASSET', 'Current Assets',      '1100', 'DR', false),
('1133', 'Advisory Fees Receivable',        'ASSET', 'Current Assets',      '1100', 'DR', false),
('1134', 'Custody Fees Receivable',         'ASSET', 'Current Assets',      '1100', 'DR', false),
('1140', 'Prepaid Expenses',                'ASSET', 'Current Assets',      '1100', 'DR', false),
('1141', 'Prepaid Rent',                    'ASSET', 'Current Assets',      '1100', 'DR', false),
('1142', 'Prepaid Insurance',               'ASSET', 'Current Assets',      '1100', 'DR', false),
('1150', 'WHT Credit Receivable',           'ASSET', 'Current Assets',      '1100', 'DR', false),
('1151', 'VAT Input',                       'ASSET', 'Current Assets',      '1100', 'DR', false),
('1160', 'Staff Salary Advances',           'ASSET', 'Current Assets',      '1100', 'DR', false),
('1190', 'Other Current Assets',            'ASSET', 'Current Assets',      '1100', 'DR', false),

-- Investment Assets
('1200', 'Investment Assets',               'ASSET', 'Investment Assets',   '1000', 'DR', true),
('1201', 'Equity Investments at Fair Value','ASSET', 'Investment Assets',   '1200', 'DR', false),
('1202', 'Fixed Income Investments',        'ASSET', 'Investment Assets',   '1200', 'DR', false),
('1203', 'Money Market Instruments',        'ASSET', 'Investment Assets',   '1200', 'DR', false),
('1204', 'Real Estate Investments',         'ASSET', 'Investment Assets',   '1200', 'DR', false),
('1205', 'Unrealised Gains on Investments', 'ASSET', 'Investment Assets',   '1200', 'DR', false),

-- Non-Current Assets
('1300', 'Non-Current Assets',              'ASSET', 'Non-Current Assets',  '1000', 'DR', true),
('1301', 'Computer Equipment',              'ASSET', 'Non-Current Assets',  '1300', 'DR', false),
('1302', 'Furniture and Fittings',          'ASSET', 'Non-Current Assets',  '1300', 'DR', false),
('1303', 'Office Equipment',                'ASSET', 'Non-Current Assets',  '1300', 'DR', false),
('1304', 'Motor Vehicles',                  'ASSET', 'Non-Current Assets',  '1300', 'DR', false),
('1310', 'Acc. Depreciation – Computers',   'ASSET', 'Non-Current Assets',  '1300', 'CR', false),
('1311', 'Acc. Depreciation – Furniture',   'ASSET', 'Non-Current Assets',  '1300', 'CR', false),
('1312', 'Acc. Depreciation – Equipment',   'ASSET', 'Non-Current Assets',  '1300', 'CR', false),
('1313', 'Acc. Depreciation – Vehicles',    'ASSET', 'Non-Current Assets',  '1300', 'CR', false),
('1320', 'Software Licences',               'ASSET', 'Non-Current Assets',  '1300', 'DR', false),
('1321', 'Acc. Amortisation – Software',    'ASSET', 'Non-Current Assets',  '1300', 'CR', false),
('1390', 'Other Non-Current Assets',        'ASSET', 'Non-Current Assets',  '1300', 'DR', false),

-- ╔══════════════════════════════════════════════════════╗
-- ║  2000 – LIABILITIES                                  ║
-- ╚══════════════════════════════════════════════════════╝
('2000', 'Liabilities',                     'LIABILITY', 'Liabilities',           NULL,   'CR', true),

-- Current Liabilities
('2100', 'Current Liabilities',             'LIABILITY', 'Current Liabilities',   '2000', 'CR', true),
('2101', 'Accounts Payable',                'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2102', 'Accrued Expenses',                'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2103', 'Accrued Audit Fees',              'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2110', 'Client Funds Payable',            'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2111', 'Client Redemptions Payable',      'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2112', 'Dividends Payable to Clients',    'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2120', 'PAYE Tax Payable',                'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2121', 'VAT Output Payable',              'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2122', 'WHT Payable',                     'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2123', 'Company Income Tax Payable',      'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2124', 'Education Tax Payable',           'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2130', 'Pension Contributions Payable',   'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2140', 'Salaries and Wages Payable',      'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2150', 'Suspense Account',                'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2160', 'Deferred Revenue',                'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),
('2190', 'Other Current Liabilities',       'LIABILITY', 'Current Liabilities',   '2100', 'CR', false),

-- Non-Current Liabilities
('2200', 'Non-Current Liabilities',         'LIABILITY', 'Non-Current Liabilities','2000','CR', true),
('2201', 'Long-Term Loans',                 'LIABILITY', 'Non-Current Liabilities','2200','CR', false),
('2202', 'Deferred Tax Liability',          'LIABILITY', 'Non-Current Liabilities','2200','CR', false),
('2290', 'Other Non-Current Liabilities',   'LIABILITY', 'Non-Current Liabilities','2200','CR', false),

-- ╔══════════════════════════════════════════════════════╗
-- ║  3000 – EQUITY                                       ║
-- ╚══════════════════════════════════════════════════════╝
('3000', 'Equity',                          'EQUITY', 'Equity',       NULL,   'CR', true),
('3001', 'Share Capital',                   'EQUITY', 'Equity',       '3000', 'CR', false),
('3002', 'Share Premium',                   'EQUITY', 'Equity',       '3000', 'CR', false),
('3003', 'Retained Earnings',               'EQUITY', 'Equity',       '3000', 'CR', false),
('3004', 'Current Year Profit / Loss',      'EQUITY', 'Equity',       '3000', 'CR', false),
('3005', 'Statutory Reserve',               'EQUITY', 'Equity',       '3000', 'CR', false),
('3006', 'Other Reserves',                  'EQUITY', 'Equity',       '3000', 'CR', false),

-- ╔══════════════════════════════════════════════════════╗
-- ║  4000 – REVENUE                                      ║
-- ╚══════════════════════════════════════════════════════╝
('4000', 'Revenue',                         'REVENUE', 'Revenue',             NULL,   'CR', true),
('4001', 'Management Fees Income',          'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4002', 'Performance Fees Income',         'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4003', 'Advisory Fees Income',            'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4004', 'Brokerage Commissions Income',    'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4005', 'Dealing Commissions Income',      'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4006', 'Fund Administration Fees',        'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4007', 'Custody Fees Income',             'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4008', 'Financial Planning Fees',         'REVENUE', 'Fee Income',          '4000', 'CR', false),
('4009', 'Arrangement and Structuring Fees','REVENUE', 'Fee Income',          '4000', 'CR', false),
('4010', 'Interest Income – Investments',   'REVENUE', 'Investment Income',   '4000', 'CR', false),
('4011', 'Dividend Income',                 'REVENUE', 'Investment Income',   '4000', 'CR', false),
('4012', 'Coupon Income',                   'REVENUE', 'Investment Income',   '4000', 'CR', false),
('4013', 'Capital Gains – Equities',        'REVENUE', 'Investment Income',   '4000', 'CR', false),
('4014', 'Capital Gains – Fixed Income',    'REVENUE', 'Investment Income',   '4000', 'CR', false),
('4015', 'Foreign Exchange Gains',          'REVENUE', 'Other Income',        '4000', 'CR', false),
('4016', 'Interest Income – Bank Deposits', 'REVENUE', 'Other Income',        '4000', 'CR', false),
('4017', 'Reversal of Impairment',          'REVENUE', 'Other Income',        '4000', 'CR', false),
('4090', 'Other Income',                    'REVENUE', 'Other Income',        '4000', 'CR', false),

-- ╔══════════════════════════════════════════════════════╗
-- ║  5000 – EXPENSES                                     ║
-- ╚══════════════════════════════════════════════════════╝
('5000', 'Expenses',                        'EXPENSE', 'Expenses',            NULL,   'DR', true),

-- Staff Costs
('5001', 'Staff Salaries and Wages',        'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5002', 'Staff Allowances and Benefits',   'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5003', 'Employer Pension Contribution',   'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5004', 'Group Life Insurance',            'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5005', 'HMO and Medical Expenses',        'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5006', 'Staff Training and Development',  'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5007', 'Recruitment Expenses',            'EXPENSE', 'Staff Costs',         '5000', 'DR', false),
('5008', 'Staff Welfare',                   'EXPENSE', 'Staff Costs',         '5000', 'DR', false),

-- Occupancy
('5100', 'Office Rent',                     'EXPENSE', 'Occupancy',           '5000', 'DR', false),
('5101', 'Rates and Levies',                'EXPENSE', 'Occupancy',           '5000', 'DR', false),
('5102', 'Electricity and Utilities',       'EXPENSE', 'Occupancy',           '5000', 'DR', false),
('5103', 'Office Maintenance and Repairs',  'EXPENSE', 'Occupancy',           '5000', 'DR', false),
('5104', 'Cleaning and Sanitation',         'EXPENSE', 'Occupancy',           '5000', 'DR', false),
('5105', 'Security Services',               'EXPENSE', 'Occupancy',           '5000', 'DR', false),

-- Technology
('5200', 'IT and Technology',               'EXPENSE', 'Technology',          '5000', 'DR', false),
('5201', 'Software Licences and Subscriptions','EXPENSE','Technology',        '5000', 'DR', false),
('5202', 'Internet and Connectivity',       'EXPENSE', 'Technology',          '5000', 'DR', false),
('5203', 'IT Support and Maintenance',      'EXPENSE', 'Technology',          '5000', 'DR', false),
('5204', 'Bloomberg / Data Subscriptions',  'EXPENSE', 'Technology',          '5000', 'DR', false),

-- Marketing
('5300', 'Marketing and Advertising',       'EXPENSE', 'Marketing',           '5000', 'DR', false),
('5301', 'Events and Sponsorships',         'EXPENSE', 'Marketing',           '5000', 'DR', false),
('5302', 'Client Entertainment',            'EXPENSE', 'Marketing',           '5000', 'DR', false),
('5303', 'Branded Materials',               'EXPENSE', 'Marketing',           '5000', 'DR', false),

-- Professional Fees
('5400', 'Audit and Assurance Fees',        'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5401', 'Legal Fees',                      'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5402', 'Consulting and Advisory Fees',    'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5403', 'SEC Regulatory Fees',             'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5404', 'NGX / NSE Charges',               'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5405', 'CSCS Clearing Fees',              'EXPENSE', 'Professional Fees',   '5000', 'DR', false),
('5406', 'PENCOM Regulatory Fees',          'EXPENSE', 'Professional Fees',   '5000', 'DR', false),

-- Travel
('5500', 'Staff Transport',                 'EXPENSE', 'Travel and Transport', '5000', 'DR', false),
('5501', 'Local Business Travel',           'EXPENSE', 'Travel and Transport', '5000', 'DR', false),
('5502', 'International Business Travel',   'EXPENSE', 'Travel and Transport', '5000', 'DR', false),
('5503', 'Vehicle Running Costs',           'EXPENSE', 'Travel and Transport', '5000', 'DR', false),

-- Depreciation and Amortisation
('5600', 'Depreciation – Computer Equipment','EXPENSE','Depreciation',        '5000', 'DR', false),
('5601', 'Depreciation – Furniture',        'EXPENSE', 'Depreciation',        '5000', 'DR', false),
('5602', 'Depreciation – Office Equipment', 'EXPENSE', 'Depreciation',        '5000', 'DR', false),
('5603', 'Depreciation – Motor Vehicles',   'EXPENSE', 'Depreciation',        '5000', 'DR', false),
('5604', 'Amortisation – Software',         'EXPENSE', 'Depreciation',        '5000', 'DR', false),

-- Finance Costs
('5700', 'Bank Charges',                    'EXPENSE', 'Finance Costs',       '5000', 'DR', false),
('5701', 'Loan Interest Expense',           'EXPENSE', 'Finance Costs',       '5000', 'DR', false),
('5702', 'Foreign Exchange Losses',         'EXPENSE', 'Finance Costs',       '5000', 'DR', false),
('5703', 'WHT Expense',                     'EXPENSE', 'Finance Costs',       '5000', 'DR', false),

-- Investment Costs
('5800', 'Transaction Costs – Equities',    'EXPENSE', 'Investment Costs',    '5000', 'DR', false),
('5801', 'Transaction Costs – Fixed Income','EXPENSE', 'Investment Costs',    '5000', 'DR', false),
('5802', 'Unrealised Losses on Investments','EXPENSE', 'Investment Costs',    '5000', 'DR', false),
('5803', 'Realised Losses on Investments',  'EXPENSE', 'Investment Costs',    '5000', 'DR', false),

-- General and Administrative
('5900', 'Printing and Stationery',         'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5901', 'Postage and Courier',             'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5902', 'Subscriptions and Memberships',   'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5903', 'Office Consumables',              'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5904', 'Insurance – General',             'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5905', 'Directors Fees',                  'EXPENSE', 'General & Admin',     '5000', 'DR', false),
('5990', 'Sundry and Miscellaneous',        'EXPENSE', 'General & Admin',     '5000', 'DR', false);

-- +goose Down
DROP TABLE IF EXISTS finance.account;
