-- +goose Up
-- Real org chart positions for Page Asset Management and Page Capital.
-- Replaces generic placeholder positions added in earlier migrations.

-- +goose StatementBegin
DO $$
DECLARE
    pam_id uuid;
    pc_id  uuid;
BEGIN
    SELECT id INTO pam_id FROM organization.subsidiary WHERE code = 'PAGE_ASSET_MGMT';
    SELECT id INTO pc_id  FROM organization.subsidiary WHERE code = 'PAGE_CAPITAL';

    -- ── PAGE_ASSET_MGMT: drop generic placeholders ───────────────────────────
    DELETE FROM organization.position
    WHERE subsidiary_id = pam_id
      AND code IN (
          'FINOPS_MANAGER', 'FUND_MANAGER', 'INVESTMENT_ANALYST',
          'OPERATIONS_OFFICER', 'TREASURY_OFFICER'
      );

    -- ── PAGE_CAPITAL: drop generic placeholders ──────────────────────────────
    DELETE FROM organization.position
    WHERE subsidiary_id = pc_id
      AND code IN (
          'BROKER_SALES_OFFICER', 'DEALING_OFFICER', 'FINOPS_MANAGER',
          'OPERATIONS_OFFICER', 'RESEARCH_ANALYST', 'SETTLEMENT_OFFICER', 'TRADER'
      );

    -- ── PAGE_ASSET_MGMT: insert real positions ───────────────────────────────
    INSERT INTO organization.position (subsidiary_id, code, title)
    SELECT pam_id, v.code, v.title
    FROM (VALUES
        ('MANAGING_DIRECTOR',         'Managing Director'),
        ('HEAD_OF_OPERATIONS',        'Head of Operations'),
        ('TREASURY_OPS_FINANCE_MGR',  'Treasury Operations & Finance Manager'),
        ('FUND_TREASURY_OPERATIONS',  'Fund & Treasury Operations'),
        ('TL_FINANCIAL_REPORTING',    'TL Financial Reporting'),
        ('FINANCE_OPS_ASSOCIATE',     'Finance & Operations Associate'),
        ('FINANCE_OPS_INTERN',        'Finance & Operations Intern'),
        ('DATA_ANALYST_INTERN',       'Data Analyst Intern'),
        ('OPERATIONS_EXECUTIVE',      'Operations Executive'),
        ('OPERATIONS_ASSOCIATE',      'Operations Associate'),
        ('GROUP_HEAD_WEALTH_MGMT',    'Group Head, Wealth Management'),
        ('PORTFOLIO_MANAGER',         'Portfolio Manager'),
        ('EQUITY_TRADER',             'Equity Trader'),
        ('PORTFOLIO_MGMT_ASSISTANT',  'Portfolio Management Assistant'),
        ('WEALTH_MANAGER',            'Wealth Manager'),
        ('HEAD_CORPORATE_COMPLIANCE', 'Head, Corporate Services & Compliance'),
        ('INTERNAL_CONTROL_OFFICER',  'Internal Control Officer'),
        ('ADMIN_OFFICER',             'Admin Officer'),
        ('BRAND_STRATEGY_MANAGER',    'Brand and Strategy Manager'),
        ('IT_SUPPORT',                'IT Support'),
        ('HEAD_HUMAN_CAPITAL',        'Head, Human Capital Management'),
        ('HR_OPS_MANAGER',            'HR Operations Manager'),
        ('HR_ADMIN',                  'HR Admin')
    ) AS v(code, title)
    WHERE NOT EXISTS (
        SELECT 1 FROM organization.position p
        WHERE p.subsidiary_id = pam_id AND p.code = v.code
    );

    -- ── PAGE_CAPITAL: insert real positions ──────────────────────────────────
    INSERT INTO organization.position (subsidiary_id, code, title)
    SELECT pc_id, v.code, v.title
    FROM (VALUES
        ('MANAGING_DIRECTOR',           'Managing Director'),
        ('HEAD_OF_INVESTMENT',          'Head of Investment'),
        ('HEAD_INVESTMENT_MGMT',        'Head, Investment Management'),
        ('GROUP_HEAD_BUSINESS_DEV',     'Group Head, Business Development'),
        ('WEALTH_MANAGER',              'Wealth Manager'),
        ('HEAD_RISK_TRADE_MGMT',        'Head, Risk and Trade Management'),
        ('TL_RESEARCH_RISK_MGMT',       'TL, Research and Risk Management'),
        ('TRADING_RESEARCH_ANALYST',    'Trading Research and Support Analyst'),
        ('QUANT_MARKET_ANALYST',        'Quantitative Market Analyst'),
        ('INVESTMENT_RESEARCH_TRAINEE', 'Investment and Research Trainee'),
        ('LEAD_SOFTWARE_ENGINEER',      'Lead, Software Engineer')
    ) AS v(code, title)
    WHERE NOT EXISTS (
        SELECT 1 FROM organization.position p
        WHERE p.subsidiary_id = pc_id AND p.code = v.code
    );
END $$;
-- +goose StatementEnd

-- ── Wire reporting lines ──────────────────────────────────────────────────────
-- +goose StatementBegin
WITH pos AS (
    SELECT p.id, p.code, s.code AS sub_code
    FROM   organization.position p
    JOIN   organization.subsidiary s ON s.id = p.subsidiary_id
    WHERE  p.subsidiary_id IS NOT NULL
    UNION ALL
    SELECT p.id, p.code, 'GROUP' AS sub_code
    FROM   organization.position p
    WHERE  p.subsidiary_id IS NULL
),
hierarchy(child_code, child_sub, parent_code, parent_sub) AS (
    VALUES
    -- ── Page Asset Management ────────────────────────────────────────────────
    ('HEAD_OF_OPERATIONS',        'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',        'PAGE_ASSET_MGMT'),
    ('TREASURY_OPS_FINANCE_MGR',  'PAGE_ASSET_MGMT', 'HEAD_OF_OPERATIONS',       'PAGE_ASSET_MGMT'),
    ('FUND_TREASURY_OPERATIONS',  'PAGE_ASSET_MGMT', 'TREASURY_OPS_FINANCE_MGR', 'PAGE_ASSET_MGMT'),
    ('TL_FINANCIAL_REPORTING',    'PAGE_ASSET_MGMT', 'HEAD_OF_OPERATIONS',       'PAGE_ASSET_MGMT'),
    ('FINANCE_OPS_ASSOCIATE',     'PAGE_ASSET_MGMT', 'TL_FINANCIAL_REPORTING',   'PAGE_ASSET_MGMT'),
    ('FINANCE_OPS_INTERN',        'PAGE_ASSET_MGMT', 'TL_FINANCIAL_REPORTING',   'PAGE_ASSET_MGMT'),
    ('DATA_ANALYST_INTERN',       'PAGE_ASSET_MGMT', 'TL_FINANCIAL_REPORTING',   'PAGE_ASSET_MGMT'),
    ('OPERATIONS_EXECUTIVE',      'PAGE_ASSET_MGMT', 'HEAD_OF_OPERATIONS',       'PAGE_ASSET_MGMT'),
    ('OPERATIONS_ASSOCIATE',      'PAGE_ASSET_MGMT', 'OPERATIONS_EXECUTIVE',     'PAGE_ASSET_MGMT'),
    ('RECONCILIATION_OFFICER',    'PAGE_ASSET_MGMT', 'HEAD_OF_OPERATIONS',       'PAGE_ASSET_MGMT'),
    ('TREASURY_ANALYST',          'PAGE_ASSET_MGMT', 'TREASURY_OPS_FINANCE_MGR', 'PAGE_ASSET_MGMT'),
    ('GROUP_HEAD_WEALTH_MGMT',    'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',        'PAGE_ASSET_MGMT'),
    ('PORTFOLIO_MANAGER',         'PAGE_ASSET_MGMT', 'GROUP_HEAD_WEALTH_MGMT',   'PAGE_ASSET_MGMT'),
    ('EQUITY_TRADER',             'PAGE_ASSET_MGMT', 'PORTFOLIO_MANAGER',        'PAGE_ASSET_MGMT'),
    ('PORTFOLIO_MGMT_ASSISTANT',  'PAGE_ASSET_MGMT', 'PORTFOLIO_MANAGER',        'PAGE_ASSET_MGMT'),
    ('WEALTH_MANAGER',            'PAGE_ASSET_MGMT', 'GROUP_HEAD_WEALTH_MGMT',   'PAGE_ASSET_MGMT'),
    ('HEAD_CORPORATE_COMPLIANCE', 'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',        'PAGE_ASSET_MGMT'),
    ('INTERNAL_CONTROL_OFFICER',  'PAGE_ASSET_MGMT', 'HEAD_CORPORATE_COMPLIANCE','PAGE_ASSET_MGMT'),
    ('ADMIN_OFFICER',             'PAGE_ASSET_MGMT', 'HEAD_CORPORATE_COMPLIANCE','PAGE_ASSET_MGMT'),
    ('BRAND_STRATEGY_MANAGER',    'PAGE_ASSET_MGMT', 'HEAD_CORPORATE_COMPLIANCE','PAGE_ASSET_MGMT'),
    ('IT_SUPPORT',                'PAGE_ASSET_MGMT', 'HEAD_CORPORATE_COMPLIANCE','PAGE_ASSET_MGMT'),
    ('HEAD_HUMAN_CAPITAL',        'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',        'PAGE_ASSET_MGMT'),
    ('HR_OPS_MANAGER',            'PAGE_ASSET_MGMT', 'HEAD_HUMAN_CAPITAL',       'PAGE_ASSET_MGMT'),
    ('HR_ADMIN',                  'PAGE_ASSET_MGMT', 'HR_OPS_MANAGER',           'PAGE_ASSET_MGMT'),

    -- ── Page Capital ─────────────────────────────────────────────────────────
    ('HEAD_OF_INVESTMENT',          'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL'),
    ('HEAD_INVESTMENT_MGMT',        'PAGE_CAPITAL', 'HEAD_OF_INVESTMENT',      'PAGE_CAPITAL'),
    ('GROUP_HEAD_BUSINESS_DEV',     'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL'),
    ('WEALTH_MANAGER',              'PAGE_CAPITAL', 'GROUP_HEAD_BUSINESS_DEV', 'PAGE_CAPITAL'),
    ('HEAD_RISK_TRADE_MGMT',        'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL'),
    ('TL_RESEARCH_RISK_MGMT',       'PAGE_CAPITAL', 'HEAD_RISK_TRADE_MGMT',    'PAGE_CAPITAL'),
    ('TRADING_RESEARCH_ANALYST',    'PAGE_CAPITAL', 'TL_RESEARCH_RISK_MGMT',   'PAGE_CAPITAL'),
    ('QUANT_MARKET_ANALYST',        'PAGE_CAPITAL', 'TL_RESEARCH_RISK_MGMT',   'PAGE_CAPITAL'),
    ('INVESTMENT_RESEARCH_TRAINEE', 'PAGE_CAPITAL', 'TL_RESEARCH_RISK_MGMT',   'PAGE_CAPITAL'),
    ('LEAD_SOFTWARE_ENGINEER',      'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL'),
    ('RECONCILIATION_OFFICER',      'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL'),
    ('TREASURY_ANALYST',            'PAGE_CAPITAL', 'MANAGING_DIRECTOR',       'PAGE_CAPITAL')
)
UPDATE organization.position p
SET    reports_to_position_id = parent.id
FROM   hierarchy h
JOIN   pos child  ON child.code  = h.child_code  AND child.sub_code  = h.child_sub
JOIN   pos parent ON parent.code = h.parent_code AND parent.sub_code = h.parent_sub
WHERE  p.id = child.id;
-- +goose StatementEnd

-- +goose Down
DELETE FROM organization.position
WHERE code IN (
    'HEAD_OF_OPERATIONS','TREASURY_OPS_FINANCE_MGR','FUND_TREASURY_OPERATIONS',
    'TL_FINANCIAL_REPORTING','FINANCE_OPS_ASSOCIATE','FINANCE_OPS_INTERN',
    'DATA_ANALYST_INTERN','OPERATIONS_EXECUTIVE','OPERATIONS_ASSOCIATE',
    'GROUP_HEAD_WEALTH_MGMT','EQUITY_TRADER','PORTFOLIO_MGMT_ASSISTANT',
    'HEAD_CORPORATE_COMPLIANCE','INTERNAL_CONTROL_OFFICER','ADMIN_OFFICER',
    'BRAND_STRATEGY_MANAGER','IT_SUPPORT','HEAD_HUMAN_CAPITAL',
    'HR_OPS_MANAGER','HR_ADMIN',
    'HEAD_OF_INVESTMENT','HEAD_INVESTMENT_MGMT','GROUP_HEAD_BUSINESS_DEV',
    'HEAD_RISK_TRADE_MGMT','TL_RESEARCH_RISK_MGMT','TRADING_RESEARCH_ANALYST',
    'QUANT_MARKET_ANALYST','INVESTMENT_RESEARCH_TRAINEE','LEAD_SOFTWARE_ENGINEER'
);
