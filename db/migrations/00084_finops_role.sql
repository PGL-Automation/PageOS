-- +goose Up
-- Creates the FINOPS_RECONCILIATION_OFFICER position for users whose only
-- access is Finance + Reconciliation — nothing else in the nav or system.

-- ── Create the position under Page Asset Management Limited ───────────────────
INSERT INTO organization.position (subsidiary_id, code, title, family)
SELECT s.id, 'FINOPS_RECONCILIATION_OFFICER', 'FinOps – Reconciliation Officer', 'finops'
FROM   organization.subsidiary s
WHERE  s.name = 'Page Asset Management Limited'
ON CONFLICT DO NOTHING;

-- Also create under Page Financials Limited (the user's subsidiary)
INSERT INTO organization.position (subsidiary_id, code, title, family)
SELECT s.id, 'FINOPS_RECONCILIATION_OFFICER', 'FinOps – Reconciliation Officer', 'finops'
FROM   organization.subsidiary s
WHERE  s.name = 'Page Financials Limited'
ON CONFLICT DO NOTHING;

-- ── Capabilities: full recon + journal posting ────────────────────────────────
INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (VALUES ('FINOPS_RECONCILIATION_OFFICER')) AS r(role_code)
CROSS JOIN (
    VALUES
        -- Reconciliation — full access
        ('recon.view'),
        ('recon.run'),
        ('recon.match'),
        ('recon.close'),
        ('recon.configure'),
        ('recon.pull'),
        -- Finance — view + post journals, view GL and reports
        ('finance.view_journals'),
        ('finance.post_journals'),
        ('finance.view_gl'),
        ('finance.view_payables'),
        ('finance.view_receivables'),
        ('finance.view_assets'),
        ('finance.view_reports'),
        ('finance.export_reports')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM organization.role_capability WHERE role_code = 'FINOPS_RECONCILIATION_OFFICER';
DELETE FROM organization.position WHERE code = 'FINOPS_RECONCILIATION_OFFICER';
