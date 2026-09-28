-- +goose Up

-- 1. Capability registry
CREATE TABLE organization.capability (
    code        TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    domain      TEXT        NOT NULL CHECK (domain IN ('finance', 'reconciliation', 'portfolio')),
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Default capabilities per role
CREATE TABLE organization.role_capability (
    role_code       TEXT NOT NULL,
    capability_code TEXT NOT NULL REFERENCES organization.capability(code),
    PRIMARY KEY (role_code, capability_code)
);

CREATE INDEX idx_role_capability_role ON organization.role_capability (role_code);

-- 3. Per-person capability overrides
CREATE TABLE organization.person_capability (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID        NOT NULL REFERENCES organization.person(id),
    capability_code TEXT        NOT NULL REFERENCES organization.capability(code),
    granted         BOOLEAN     NOT NULL DEFAULT true,
    granted_by      UUID        NOT NULL REFERENCES organization.person(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    UNIQUE (person_id, capability_code)
);

CREATE INDEX idx_person_capability_person ON organization.person_capability (person_id);
CREATE INDEX idx_person_capability_active ON organization.person_capability (person_id) WHERE is_active = true;

-- -------------------------------------------------------------------------
-- Capability definitions
-- -------------------------------------------------------------------------

INSERT INTO organization.capability (code, name, description, domain, sort_order) VALUES
    -- Finance domain
    ('finance.view_journals',          'View Journals',               'View and read journal entries',                         'finance',         1),
    ('finance.create_journals',        'Create Journals',             'Create draft journal entries',                          'finance',         2),
    ('finance.post_journals',          'Post Journals',               'Post draft journals to the general ledger',             'finance',         3),
    ('finance.approve_journals',       'Approve Journals',            'Approve journals submitted for approval',               'finance',         4),
    ('finance.reverse_journals',       'Reverse Journals',            'Reverse posted journal entries',                        'finance',         5),
    ('finance.view_payables',          'View Payables',               'View accounts payable invoices and aging',              'finance',         6),
    ('finance.create_payables',        'Create Payables',             'Create payable invoices',                               'finance',         7),
    ('finance.approve_payables',       'Approve Payables',            'Approve payable invoices',                              'finance',         8),
    ('finance.pay_payables',           'Pay Payables',                'Record payments against payables',                      'finance',         9),
    ('finance.view_receivables',       'View Receivables',            'View accounts receivable invoices and aging',           'finance',        10),
    ('finance.create_receivables',     'Create Receivables',          'Create receivable invoices',                            'finance',        11),
    ('finance.receive_payments',       'Receive Payments',            'Record receipts against receivables',                   'finance',        12),
    ('finance.view_assets',            'View Fixed Assets',           'View the fixed asset register',                         'finance',        13),
    ('finance.manage_assets',          'Manage Fixed Assets',         'Create and update fixed assets',                        'finance',        14),
    ('finance.depreciate_assets',      'Depreciate Assets',           'Run depreciation and record disposals',                 'finance',        15),
    ('finance.view_reports',           'View Financial Reports',      'View P&L, balance sheet, cash flow, trial balance',     'finance',        16),
    ('finance.export_reports',         'Export Reports',              'Download financial reports to Excel or PDF',            'finance',        17),
    ('finance.manage_budget',          'Manage Budget',               'Create and update budget targets',                      'finance',        18),
    ('finance.manage_vendors',         'Manage Vendors',              'Create and update vendor records',                      'finance',        19),
    ('finance.manage_fx_rates',        'Manage FX Rates',             'Set foreign exchange rates',                            'finance',        20),
    ('finance.view_gl',                'View General Ledger',         'View chart of accounts, ledger, and periods',           'finance',        21),
    ('finance.manage_gl',              'Manage General Ledger',       'Create accounts and manage accounting periods',         'finance',        22),

    -- Reconciliation domain
    ('recon.view',                     'View Reconciliation',         'View reconciliation runs, statements, and matches',     'reconciliation',  1),
    ('recon.run',                      'Run Reconciliation',          'Create runs, upload statements, sync GL',               'reconciliation',  2),
    ('recon.match',                    'Match Transactions',          'Manually match and unmatch bank lines',                 'reconciliation',  3),
    ('recon.close',                    'Close Runs',                  'Close reconciliation runs',                             'reconciliation',  4),
    ('recon.configure',                'Configure Bank Connectivity', 'Set up Mono/Okra connectivity and GL codes',            'reconciliation',  5),
    ('recon.pull',                     'Pull Bank Statements',        'Trigger automated bank statement pulls',                'reconciliation',  6),

    -- Portfolio domain
    ('portfolio.view',                 'View Portfolio',              'View funds, holdings, transactions, and instruments',   'portfolio',       1),
    ('portfolio.book_trades',          'Book Trades',                 'Record buy and sell trades',                            'portfolio',       2),
    ('portfolio.subscribe',            'Process Subscriptions',       'Open client accounts and process subscriptions',        'portfolio',       3),
    ('portfolio.redeem',               'Process Redemptions',         'Process client redemptions and early liquidations',     'portfolio',       4),
    ('portfolio.corporate_actions',    'Manage Corporate Actions',    'Create and process corporate actions',                  'portfolio',       5),
    ('portfolio.calculate_nav',        'Calculate NAV',               'Run NAV calculations for funds',                        'portfolio',       6),
    ('portfolio.view_performance',     'View Performance Analytics',  'View TWR, MWR, Sharpe ratio, and benchmark data',       'portfolio',       7),
    ('portfolio.manage_compliance',    'Manage Compliance Rules',     'Create and delete compliance rules',                    'portfolio',       8),
    ('portfolio.acknowledge_breaches', 'Acknowledge Breaches',        'Acknowledge and resolve compliance breaches',           'portfolio',       9),
    ('portfolio.rebalance',            'Execute Rebalancing',         'Set target allocations and execute rebalancing trades', 'portfolio',      10),
    ('portfolio.view_client_reports',  'View Client Reports',         'View and access client 360° statements',                'portfolio',      11),
    ('portfolio.export_client_reports','Export Client Reports',       'Download client reports to Excel',                      'portfolio',      12)
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------
-- Role defaults
-- -------------------------------------------------------------------------

-- Finance: Full access roles — all finance + all recon capabilities
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('HEAD_OF_OPERATIONS'),
        ('TREASURY_OPS_FINANCE_MGR'),
        ('FINOPS_MANAGER'),
        ('TL_FINANCIAL_REPORTING')
) AS r(role_code)
CROSS JOIN organization.capability c
WHERE c.domain IN ('finance', 'reconciliation')
ON CONFLICT DO NOTHING;

-- Finance: Mid access roles — selected finance + recon.view/run/match
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('FINANCE_OFFICER'),
        ('FINANCE_OPS_ASSOCIATE'),
        ('OPERATIONS_EXECUTIVE')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('finance.view_journals'),
        ('finance.create_journals'),
        ('finance.view_payables'),
        ('finance.create_payables'),
        ('finance.view_receivables'),
        ('finance.create_receivables'),
        ('finance.view_assets'),
        ('finance.manage_assets'),
        ('finance.view_reports'),
        ('finance.export_reports'),
        ('finance.manage_budget'),
        ('finance.manage_vendors'),
        ('finance.view_gl'),
        ('recon.view'),
        ('recon.run'),
        ('recon.match')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- Finance: View/export only roles — limited finance + all recon capabilities
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('FUND_TREASURY_OPERATIONS'),
        ('RECONCILIATION_OFFICER'),
        ('TREASURY_ANALYST'),
        ('TREASURY_OFFICER'),
        ('FINANCE_OPS_INTERN'),
        ('OPERATIONS_ASSOCIATE')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('finance.view_journals'),
        ('finance.view_payables'),
        ('finance.view_receivables'),
        ('finance.view_assets'),
        ('finance.view_reports'),
        ('finance.export_reports'),
        ('finance.view_gl'),
        ('recon.view'),
        ('recon.run'),
        ('recon.match'),
        ('recon.close'),
        ('recon.configure'),
        ('recon.pull')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- Portfolio: Full access roles — all 12 portfolio capabilities
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('HEAD_OF_INVESTMENT'),
        ('HEAD_INVESTMENT_MGMT'),
        ('GROUP_HEAD_WEALTH_MGMT'),
        ('PORTFOLIO_MANAGER')
) AS r(role_code)
CROSS JOIN organization.capability c
WHERE c.domain = 'portfolio'
ON CONFLICT DO NOTHING;

-- Portfolio: View + trade roles
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('EQUITY_TRADER')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('portfolio.view'),
        ('portfolio.book_trades'),
        ('portfolio.subscribe'),
        ('portfolio.redeem'),
        ('portfolio.view_performance'),
        ('portfolio.view_client_reports')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- Portfolio: View only roles
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('PORTFOLIO_MGMT_ASSISTANT'),
        ('INVESTMENT_ANALYST')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('portfolio.view'),
        ('portfolio.view_performance'),
        ('portfolio.view_client_reports'),
        ('portfolio.export_client_reports')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- GROUP_ADMIN: all capabilities across all domains
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT 'GROUP_ADMIN', c.code
FROM organization.capability c
ON CONFLICT DO NOTHING;

-- +goose Down

DROP TABLE IF EXISTS organization.person_capability;
DROP TABLE IF EXISTS organization.role_capability;
DROP TABLE IF EXISTS organization.capability;
