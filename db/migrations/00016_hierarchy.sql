-- +goose Up
-- Org hierarchy: each position now knows who it reports to.
-- Also adds FinOps/Reconciliation positions shared between Page Asset Management
-- and Page Capital (FinOps is a shared department in practice).

-- ── Hierarchy ─────────────────────────────────────────────────────────────────
ALTER TABLE organization.position
    ADD COLUMN IF NOT EXISTS reports_to_position_id uuid
        REFERENCES organization.position (id) ON DELETE SET NULL;

COMMENT ON COLUMN organization.position.reports_to_position_id IS
    'Immediate parent in the reporting chain. NULL = top of hierarchy for this subsidiary/group.';

-- ── FinOps positions shared between PAGE_ASSET_MGMT and PAGE_CAPITAL ─────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT s.id, v.code, v.title
FROM organization.subsidiary s
CROSS JOIN (VALUES
    ('FINOPS_MANAGER',          'FinOps Manager'),
    ('RECONCILIATION_OFFICER',  'Reconciliation Officer'),
    ('TREASURY_ANALYST',        'Treasury Analyst')
) AS v(code, title)
WHERE s.code IN ('PAGE_ASSET_MGMT', 'PAGE_CAPITAL')
  AND NOT EXISTS (
    SELECT 1 FROM organization.position p
    WHERE p.subsidiary_id = s.id AND p.code = v.code
  );

-- ── Reporting hierarchies ──────────────────────────────────────────────────────
-- Sets reports_to_position_id using a CTE so we can reference positions by code+subsidiary.

-- goose StatementBegin
WITH pos AS (
    SELECT p.id, p.code, s.code AS sub_code
    FROM organization.position p
    JOIN organization.subsidiary s ON s.id = p.subsidiary_id
    WHERE p.subsidiary_id IS NOT NULL
    UNION ALL
    -- group-level positions also indexed (subsidiary_id IS NULL)
    SELECT p.id, p.code, 'GROUP' AS sub_code
    FROM organization.position p
    WHERE p.subsidiary_id IS NULL
),
hierarchy(child_code, child_sub, parent_code, parent_sub) AS (
    VALUES
    -- ── Page Asset Management ────────────────────────────────────────────────
    ('PORTFOLIO_MANAGER',        'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('FUND_MANAGER',             'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('WEALTH_MANAGER',           'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('INVESTMENT_ANALYST',       'PAGE_ASSET_MGMT', 'PORTFOLIO_MANAGER',    'PAGE_ASSET_MGMT'),
    ('TREASURY_OFFICER',         'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('OPERATIONS_OFFICER',       'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('FINOPS_MANAGER',           'PAGE_ASSET_MGMT', 'MANAGING_DIRECTOR',    'PAGE_ASSET_MGMT'),
    ('RECONCILIATION_OFFICER',   'PAGE_ASSET_MGMT', 'FINOPS_MANAGER',       'PAGE_ASSET_MGMT'),
    ('TREASURY_ANALYST',         'PAGE_ASSET_MGMT', 'FINOPS_MANAGER',       'PAGE_ASSET_MGMT'),

    -- ── Page Capital (stockbroking) ──────────────────────────────────────────
    ('TRADER',                   'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('DEALING_OFFICER',          'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('RESEARCH_ANALYST',         'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('BROKER_SALES_OFFICER',     'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('SETTLEMENT_OFFICER',       'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('OPERATIONS_OFFICER',       'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('FINOPS_MANAGER',           'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),
    ('RECONCILIATION_OFFICER',   'PAGE_CAPITAL',    'FINOPS_MANAGER',       'PAGE_CAPITAL'),
    ('TREASURY_ANALYST',         'PAGE_CAPITAL',    'FINOPS_MANAGER',       'PAGE_CAPITAL'),
    -- Also in PAGE_CAPITAL, legacy WM position reports to MD
    ('WEALTH_MANAGER',           'PAGE_CAPITAL',    'MANAGING_DIRECTOR',    'PAGE_CAPITAL'),

    -- ── Page Insurance ───────────────────────────────────────────────────────
    ('INSURANCE_BROKER',            'PAGE_INSURANCE', 'MANAGING_DIRECTOR',  'PAGE_INSURANCE'),
    ('CLAIMS_OFFICER',              'PAGE_INSURANCE', 'MANAGING_DIRECTOR',  'PAGE_INSURANCE'),
    ('UNDERWRITER',                 'PAGE_INSURANCE', 'MANAGING_DIRECTOR',  'PAGE_INSURANCE'),
    ('CLIENT_RELATIONSHIP_OFFICER', 'PAGE_INSURANCE', 'MANAGING_DIRECTOR',  'PAGE_INSURANCE'),
    ('OPERATIONS_OFFICER',          'PAGE_INSURANCE', 'MANAGING_DIRECTOR',  'PAGE_INSURANCE'),

    -- ── Page Financials ──────────────────────────────────────────────────────
    ('CREDIT_OFFICER',           'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),
    ('LOAN_OFFICER',             'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),
    ('RECOVERY_OFFICER',         'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),
    ('FINANCE_OFFICER',          'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),
    ('RELATIONSHIP_MANAGER',     'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),
    ('OPERATIONS_OFFICER',       'PAGE_FINANCIALS', 'MANAGING_DIRECTOR',   'PAGE_FINANCIALS'),

    -- ── Group-level hierarchy ────────────────────────────────────────────────
    ('HR_MANAGER',     'GROUP', 'GROUP_ADMIN', 'GROUP'),
    ('HR_OFFICER',     'GROUP', 'HR_MANAGER',  'GROUP'),
    ('IT_ADMIN',       'GROUP', 'GROUP_ADMIN', 'GROUP'),
    ('GROUP_FINANCE',  'GROUP', 'GROUP_ADMIN', 'GROUP'),
    ('COMPLIANCE_MANAGER', 'GROUP', 'GROUP_ADMIN', 'GROUP')
)
UPDATE organization.position p
SET reports_to_position_id = parent.id
FROM hierarchy h
JOIN pos child  ON child.code = h.child_code  AND child.sub_code = h.child_sub
JOIN pos parent ON parent.code = h.parent_code AND parent.sub_code = h.parent_sub
WHERE p.id = child.id;
-- goose StatementEnd

-- +goose Down
ALTER TABLE organization.position DROP COLUMN IF EXISTS reports_to_position_id;
DELETE FROM organization.position WHERE code IN ('FINOPS_MANAGER','RECONCILIATION_OFFICER','TREASURY_ANALYST');
