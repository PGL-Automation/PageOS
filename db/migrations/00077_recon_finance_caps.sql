-- +goose Up
-- Grant full reconciliation capabilities to all finance-family positions.
-- FINANCE_OFFICER, FINANCE_OPS_ASSOCIATE, and OPERATIONS_EXECUTIVE previously
-- had only recon.view/run/match; DATA_ANALYST_INTERN had none at all.

INSERT INTO organization.role_capability (role_code, capability_code)
SELECT r.role_code, c.code
FROM (
    VALUES
        ('FINANCE_OFFICER'),
        ('FINANCE_OPS_ASSOCIATE'),
        ('OPERATIONS_EXECUTIVE'),
        ('DATA_ANALYST_INTERN')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('recon.view'),
        ('recon.run'),
        ('recon.match'),
        ('recon.close'),
        ('recon.configure'),
        ('recon.pull')
) AS cap(code)
JOIN organization.capability c ON c.code = cap.code
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM organization.role_capability
WHERE role_code IN (
    'FINANCE_OFFICER', 'FINANCE_OPS_ASSOCIATE',
    'OPERATIONS_EXECUTIVE', 'DATA_ANALYST_INTERN'
)
AND capability_code IN (
    'recon.close', 'recon.configure', 'recon.pull'
);
