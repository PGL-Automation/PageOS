-- +goose Up
-- Correct the subsidiary list and seed positions per subsidiary.
-- Each subsidiary has its own role set reflecting its business line.
-- Compliance Manager moves to group-level (shared service across all subsidiaries).

-- ── Correct subsidiary names ──────────────────────────────────────────────────
UPDATE organization.subsidiary SET name = 'Page Capital Limited' WHERE code = 'PAGE_CAPITAL';

INSERT INTO organization.subsidiary (code, name)
VALUES
    ('PAGE_ASSET_MGMT', 'Page Asset Management Limited'),
    ('PAGE_INSURANCE',  'Page Insurance Brokers Limited'),
    ('PAGE_FINANCIALS', 'Page Financials Limited')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ── Compliance Manager → group-level (serves all subsidiaries) ───────────────
UPDATE organization.position
SET subsidiary_id = NULL
WHERE code = 'COMPLIANCE_MANAGER'
  AND subsidiary_id IS NOT NULL;

-- ── Page Capital Limited — stockbroking / capital markets ─────────────────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT s.id, v.code, v.title
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('MANAGING_DIRECTOR',   'Managing Director'),
    ('TRADER',               'Trader'),
    ('DEALING_OFFICER',      'Dealing Officer'),
    ('RESEARCH_ANALYST',     'Research Analyst'),
    ('BROKER_SALES_OFFICER', 'Broker Sales Officer'),
    ('SETTLEMENT_OFFICER',   'Settlement Officer'),
    ('OPERATIONS_OFFICER',   'Operations Officer')
) AS v(code, title)
WHERE s.code = 'PAGE_CAPITAL'
  AND NOT EXISTS (
    SELECT 1 FROM organization.position p
    WHERE p.subsidiary_id = s.id AND p.code = v.code
  );

-- ── Page Asset Management Limited — fund & wealth management ─────────────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT s.id, v.code, v.title
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('MANAGING_DIRECTOR',  'Managing Director'),
    ('PORTFOLIO_MANAGER',  'Portfolio Manager'),
    ('FUND_MANAGER',       'Fund Manager'),
    ('INVESTMENT_ANALYST', 'Investment Analyst'),
    ('WEALTH_MANAGER',     'Wealth Manager'),
    ('TREASURY_OFFICER',   'Treasury Officer'),
    ('OPERATIONS_OFFICER', 'Operations Officer')
) AS v(code, title)
WHERE s.code = 'PAGE_ASSET_MGMT'
  AND NOT EXISTS (
    SELECT 1 FROM organization.position p
    WHERE p.subsidiary_id = s.id AND p.code = v.code
  );

-- ── Page Insurance Brokers Limited ───────────────────────────────────────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT s.id, v.code, v.title
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('MANAGING_DIRECTOR',           'Managing Director'),
    ('INSURANCE_BROKER',            'Insurance Broker'),
    ('CLAIMS_OFFICER',              'Claims Officer'),
    ('UNDERWRITER',                 'Underwriter'),
    ('CLIENT_RELATIONSHIP_OFFICER', 'Client Relationship Officer'),
    ('OPERATIONS_OFFICER',          'Operations Officer')
) AS v(code, title)
WHERE s.code = 'PAGE_INSURANCE'
  AND NOT EXISTS (
    SELECT 1 FROM organization.position p
    WHERE p.subsidiary_id = s.id AND p.code = v.code
  );

-- ── Page Financials Limited — consumer lending / finance ──────────────────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT s.id, v.code, v.title
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('MANAGING_DIRECTOR',   'Managing Director'),
    ('CREDIT_OFFICER',      'Credit Officer'),
    ('LOAN_OFFICER',        'Loan Officer'),
    ('RECOVERY_OFFICER',    'Recovery Officer'),
    ('FINANCE_OFFICER',     'Finance Officer'),
    ('RELATIONSHIP_MANAGER','Relationship Manager'),
    ('OPERATIONS_OFFICER',  'Operations Officer')
) AS v(code, title)
WHERE s.code = 'PAGE_FINANCIALS'
  AND NOT EXISTS (
    SELECT 1 FROM organization.position p
    WHERE p.subsidiary_id = s.id AND p.code = v.code
  );

-- +goose Down
DELETE FROM organization.subsidiary WHERE code IN ('PAGE_ASSET_MGMT','PAGE_INSURANCE','PAGE_FINANCIALS');
UPDATE organization.subsidiary SET name = 'Page Capital' WHERE code = 'PAGE_CAPITAL';
