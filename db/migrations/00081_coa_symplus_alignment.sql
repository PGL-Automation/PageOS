-- +goose Up
-- Full alignment of the PageOS chart of accounts with the Symplus COA.
-- Updates existing account names and adds every missing account class.

-- ════════════════════════════════════════════════════════════════════
-- PART 1 — Update existing account names to match Symplus naming
-- ════════════════════════════════════════════════════════════════════

-- Investment assets
UPDATE finance.account SET name = 'Fixed Placement'                                     WHERE code = '1202';
UPDATE finance.account SET name = 'Treasury Bills'                                       WHERE code = '1203';
UPDATE finance.account SET name = 'Equity – Trading/FVTPL (Discretionary)'              WHERE code = '1201';
UPDATE finance.account SET name = 'Software (Symplus) – Cost'                            WHERE code = '1320';
UPDATE finance.account SET name = 'Software (Symplus) – Accumulated Amortisation'       WHERE code = '1321';

-- Current assets / receivables
UPDATE finance.account SET name = 'Withholding Tax Receivable'                           WHERE code = '1150';
UPDATE finance.account SET name = 'Prepaid Rent'                                         WHERE code = '1141';
UPDATE finance.account SET name = 'Prepaid Insurance'                                    WHERE code = '1142';

-- Fixed assets
UPDATE finance.account SET name = 'Computer Equipment – Cost'                            WHERE code = '1301';
UPDATE finance.account SET name = 'Computer Equipment – Accumulated Depreciation'        WHERE code = '1310';
UPDATE finance.account SET name = 'Furniture & Fittings – Cost'                          WHERE code = '1302';
UPDATE finance.account SET name = 'Furniture & Fittings – Accumulated Depreciation'      WHERE code = '1311';
UPDATE finance.account SET name = 'Motor Vehicle – Cost'                                  WHERE code = '1304';
UPDATE finance.account SET name = 'Motor Vehicle – Accumulated Depreciation'             WHERE code = '1313';

-- Liabilities
UPDATE finance.account SET name = 'Accrued Audit Fees'                                   WHERE code = '2103';
UPDATE finance.account SET name = 'VAT Payable'                                          WHERE code = '2121';
UPDATE finance.account SET name = 'WHT Payable'                                          WHERE code = '2122';
UPDATE finance.account SET name = 'Income Tax Payable'                                   WHERE code = '2123';
UPDATE finance.account SET name = 'Other Payables'                                       WHERE code = '2190';

-- Income
UPDATE finance.account SET name = 'Interest Income on Treasury Bill'                     WHERE code = '4010';
UPDATE finance.account SET name = 'Dividend Income'                                      WHERE code = '4011';
UPDATE finance.account SET name = 'Interest Income on Bond'                              WHERE code = '4012';
UPDATE finance.account SET name = 'Gain on Sales of Shares'                              WHERE code = '4013';
UPDATE finance.account SET name = 'Realised Gains/(Losses) on AFS Instruments'          WHERE code = '4014';
UPDATE finance.account SET name = 'Interest Income on Call Placement'                    WHERE code = '4016';
UPDATE finance.account SET name = 'Management Fee Income'                                WHERE code = '4001';
UPDATE finance.account SET name = 'Other Income – Others'                                WHERE code = '4090';

-- Expenses – staff
UPDATE finance.account SET name = 'Salaries and Wages'                                   WHERE code = '5001';
UPDATE finance.account SET name = 'Staff Allowances and Benefits'                        WHERE code = '5002';
UPDATE finance.account SET name = 'Pension Contribution – Employer'                      WHERE code = '5003';
UPDATE finance.account SET name = 'Group Life Insurance'                                  WHERE code = '5004';
UPDATE finance.account SET name = 'Medicals'                                              WHERE code = '5005';
UPDATE finance.account SET name = 'Training Expense'                                     WHERE code = '5006';
UPDATE finance.account SET name = 'Recruitment Expenses'                                 WHERE code = '5007';
UPDATE finance.account SET name = 'Staff Welfare'                                        WHERE code = '5008';

-- Expenses – occupancy
UPDATE finance.account SET name = 'Rent'                                                  WHERE code = '5100';
UPDATE finance.account SET name = 'Electricity and Water'                                 WHERE code = '5102';
UPDATE finance.account SET name = 'Repair and Maintenance'                               WHERE code = '5103';
UPDATE finance.account SET name = 'Cleaning and Office Supplies'                         WHERE code = '5104';
UPDATE finance.account SET name = 'Security'                                              WHERE code = '5105';

-- Expenses – technology
UPDATE finance.account SET name = 'Telephone and Internet'                               WHERE code = '5202';

-- Expenses – marketing
UPDATE finance.account SET name = 'Advertising'                                          WHERE code = '5300';
UPDATE finance.account SET name = 'Business Development'                                 WHERE code = '5301';
UPDATE finance.account SET name = 'Entertainment'                                        WHERE code = '5302';
UPDATE finance.account SET name = 'Branded Materials'                                    WHERE code = '5303';

-- Expenses – professional fees
UPDATE finance.account SET name = 'Audit Fee'                                            WHERE code = '5400';
UPDATE finance.account SET name = 'Legal Fees'                                           WHERE code = '5401';
UPDATE finance.account SET name = 'Professional Fees – Others'                           WHERE code = '5402';
UPDATE finance.account SET name = 'SEC Fees – Filing, Registration, Others'             WHERE code = '5403';

-- Expenses – travel
UPDATE finance.account SET name = 'Travel and Accommodation'                             WHERE code = '5501';
UPDATE finance.account SET name = 'Motor Vehicle Expenses'                               WHERE code = '5503';

-- Expenses – depreciation
UPDATE finance.account SET name = 'Depreciation – Computer Equipment'                   WHERE code = '5600';
UPDATE finance.account SET name = 'Depreciation – Furniture and Fittings'               WHERE code = '5601';
UPDATE finance.account SET name = 'Depreciation – Office Equipment'                     WHERE code = '5602';
UPDATE finance.account SET name = 'Depreciation – Motor Vehicle'                        WHERE code = '5603';
UPDATE finance.account SET name = 'Amortization – Software (Symplus)'                   WHERE code = '5604';

-- Expenses – finance costs
UPDATE finance.account SET name = 'Bank Charges'                                         WHERE code = '5700';

-- Expenses – G&A
UPDATE finance.account SET name = 'Printing and Stationery'                             WHERE code = '5900';
UPDATE finance.account SET name = 'Insurance'                                            WHERE code = '5904';
UPDATE finance.account SET name = 'Directors Fees'                                      WHERE code = '5905';
UPDATE finance.account SET name = 'Sundry and Miscellaneous'                            WHERE code = '5990';


-- ════════════════════════════════════════════════════════════════════
-- PART 2 — Add missing accounts
-- ════════════════════════════════════════════════════════════════════

INSERT INTO finance.account
    (code, name, account_type, account_group, parent_code, normal_balance, is_header)
VALUES

-- ── Investment assets (children of 1200) ────────────────────────────
('1210','Fixed Placement – Short Term',                   'ASSET','Investment Assets','1200','DR',false),
('1211','Fixed Placement Interest Receivable',            'ASSET','Investment Assets','1200','DR',false),
('1212','ST-Fixed Placement Interest Receivable',         'ASSET','Investment Assets','1200','DR',false),
('1213','PROP – Fixed Placement Interest Receivable',     'ASSET','Investment Assets','1200','DR',false),
('1214','AFS Bond',                                        'ASSET','Investment Assets','1200','DR',false),
('1215','Interest Income Receivable – AFS Bond',          'ASSET','Investment Assets','1200','DR',false),
('1216','Interest Income Receivable – AFS Treasury Bill', 'ASSET','Investment Assets','1200','DR',false),
('1217','Fixed Placement – Providus Bank',                'ASSET','Investment Assets','1200','DR',false),
('1218','Commercial Paper – Interest Receivable',         'ASSET','Investment Assets','1200','DR',false),
('1219','Commercial Paper',                               'ASSET','Investment Assets','1200','DR',false),
('1220','Equity – Trading/FVTPL',                         'ASSET','Investment Assets','1200','DR',false),
('1221','Dividend Income Receivable',                     'ASSET','Current Assets',   '1100','DR',false),

-- ── Impairment allowances – contra assets (CR normal) ────────────────
('1230','Impairment Allowance – Treasury Bills',          'ASSET','Investment Assets','1200','CR',false),
('1231','Impairment Allowance – Fixed Deposits',          'ASSET','Investment Assets','1200','CR',false),
('1232','Impairment Allowance – Commercial Papers',       'ASSET','Investment Assets','1200','CR',false),
('1233','Impairment Allowance – Bonds',                   'ASSET','Investment Assets','1200','CR',false),
('1234','Impairment Allowance – Cash and Cash Equivalents','ASSET','Current Assets',  '1100','CR',false),

-- ── Additional receivables (children of 1100) ────────────────────────
('1155','Equity Trade Receivable',                        'ASSET','Current Assets','1100','DR',false),
('1156','Intercompany Receivables – Page Capital',        'ASSET','Current Assets','1100','DR',false),
('1157','Receivables – PMMF',                             'ASSET','Current Assets','1100','DR',false),
('1158','Management Fee Income Receivable',               'ASSET','Current Assets','1100','DR',false),

-- ── Additional prepayments (children of 1100) ────────────────────────
('1143','Prepaid HMO',                                    'ASSET','Current Assets','1100','DR',false),
('1144','Prepaid Professional Fees',                      'ASSET','Current Assets','1100','DR',false),
('1145','Prepaid Software Support',                       'ASSET','Current Assets','1100','DR',false),
('1146','Prepaid Others',                                 'ASSET','Current Assets','1100','DR',false),

-- ── Fixed assets – new (children of 1300) ────────────────────────────
('1314','Plant and Machinery – Cost',                     'ASSET','Non-Current Assets','1300','DR',false),
('1315','Plant and Machinery – Accumulated Depreciation', 'ASSET','Non-Current Assets','1300','CR',false),
('1316','Office Equipment – Cost',                        'ASSET','Non-Current Assets','1300','DR',false),
('1317','Office Equipment – Accumulated Depreciation',    'ASSET','Non-Current Assets','1300','CR',false),
('1318','Other Intangible Assets',                        'ASSET','Non-Current Assets','1300','DR',false),

-- ── Additional liabilities (children of 2100) ────────────────────────
('2115','Interest Expense Payable – Fund I',              'LIABILITY','Current Liabilities','2100','CR',false),
('2116','Customer Cash Liabilities – Fund I',             'LIABILITY','Current Liabilities','2100','CR',false),

-- ── Income – new (children of 4000) ──────────────────────────────────
('4020','Interest Income on Fixed Placement',             'REVENUE','Investment Income','4000','CR',false),
('4021','Interest Income on Commercial Papers',           'REVENUE','Investment Income','4000','CR',false),
('4022','Revaluation Gain on Equity Investment',          'REVENUE','Other Income',    '4000','CR',false),
('4023','Profit on Disposal of Fixed Asset',              'REVENUE','Other Income',    '4000','CR',false),
('4024','Penal Charge Income',                            'REVENUE','Other Income',    '4000','CR',false),

-- ── Staff costs – new ────────────────────────────────────────────────
('5009','Pension Contribution – Employee',                'EXPENSE','Staff Costs','5000','DR',false),
('5010','PAYE Expense',                                   'EXPENSE','Staff Costs','5000','DR',false),
('5011','ECS / NSITF Levy',                               'EXPENSE','Staff Costs','5000','DR',false),
('5012','ITF Contribution',                               'EXPENSE','Staff Costs','5000','DR',false),

-- ── Occupancy – new ──────────────────────────────────────────────────
('5106','Office Refurbishment',                           'EXPENSE','Occupancy','5000','DR',false),

-- ── Technology – new ─────────────────────────────────────────────────
('5205','Computer Expenses',                              'EXPENSE','Technology','5000','DR',false),
('5206','Diesel and Fuel Expense',                        'EXPENSE','Technology','5000','DR',false),

-- ── Professional fees – new ──────────────────────────────────────────
('5408','Custody Fees',                                   'EXPENSE','Professional Fees','5000','DR',false),
('5409','AGM Expense',                                    'EXPENSE','Professional Fees','5000','DR',false),
('5410','Professional Fees – Taxation',                   'EXPENSE','Professional Fees','5000','DR',false),

-- ── Depreciation – new ───────────────────────────────────────────────
('5605','Depreciation – Plant and Machinery',             'EXPENSE','Depreciation','5000','DR',false),

-- ── Finance costs – new ──────────────────────────────────────────────
('5705','Interest Expense on Managed Funds',              'EXPENSE','Finance Costs','5000','DR',false),
('5706','Commission Expenses',                            'EXPENSE','Finance Costs','5000','DR',false),

-- ── G&A – new ────────────────────────────────────────────────────────
('5291','VAT Expense',                                    'EXPENSE','General & Admin','5000','DR',false),
('5292','Taxation Expense',                               'EXPENSE','General & Admin','5000','DR',false),
('5293','Loss on Disposal of Fixed Asset',                'EXPENSE','General & Admin','5000','DR',false),

-- ── Impairment charges – expenses ────────────────────────────────────
('5804','Impairment Charge – Commercial Papers',          'EXPENSE','Investment Costs','5000','DR',false),
('5805','Impairment Charge – Fixed Deposits',             'EXPENSE','Investment Costs','5000','DR',false),
('5806','Impairment Charge – Treasury Bills',             'EXPENSE','Investment Costs','5000','DR',false),
('5807','Impairment Charge – Bonds',                      'EXPENSE','Investment Costs','5000','DR',false),
('5808','Impairment Charge – Cash and Cash Equivalents',  'EXPENSE','Investment Costs','5000','DR',false)

ON CONFLICT (code) DO UPDATE SET
    name          = EXCLUDED.name,
    account_type  = EXCLUDED.account_type,
    account_group = EXCLUDED.account_group,
    normal_balance = EXCLUDED.normal_balance;

-- +goose Down
-- Revert name updates
UPDATE finance.account SET name = 'Fixed Income Investments'                WHERE code = '1202';
UPDATE finance.account SET name = 'Money Market Instruments'                WHERE code = '1203';
UPDATE finance.account SET name = 'Equity Investments at Fair Value'        WHERE code = '1201';
UPDATE finance.account SET name = 'Software Licences'                       WHERE code = '1320';
UPDATE finance.account SET name = 'Acc. Amortisation – Software'            WHERE code = '1321';
UPDATE finance.account SET name = 'WHT Credit Receivable'                   WHERE code = '1150';
UPDATE finance.account SET name = 'Prepaid Rent'                            WHERE code = '1141';
UPDATE finance.account SET name = 'Prepaid Insurance'                       WHERE code = '1142';

-- Remove added accounts
DELETE FROM finance.account WHERE code IN (
  '1210','1211','1212','1213','1214','1215','1216','1217','1218','1219','1220','1221',
  '1230','1231','1232','1233','1234',
  '1155','1156','1157','1158',
  '1143','1144','1145','1146',
  '1314','1315','1316','1317','1318',
  '2115','2116',
  '4020','4021','4022','4023','4024',
  '5009','5010','5011','5012',
  '5106','5205','5206',
  '5408','5409','5410',
  '5605','5705','5706',
  '5291','5292','5293',
  '5804','5805','5806','5807','5808'
);
