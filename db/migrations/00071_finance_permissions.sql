-- +goose Up

CREATE TABLE finance.role_permission (
    role_code    TEXT        NOT NULL,
    module       TEXT        NOT NULL,
    can_view     BOOLEAN     NOT NULL DEFAULT false,
    can_create   BOOLEAN     NOT NULL DEFAULT false,
    can_approve  BOOLEAN     NOT NULL DEFAULT false,
    can_export   BOOLEAN     NOT NULL DEFAULT false,
    updated_by   UUID,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_code, module),
    CHECK (module IN (
        'journals',
        'reports',
        'budget',
        'fx_rates',
        'fixed_assets',
        'vendors',
        'payables',
        'receivables',
        'general_ledger'
    ))
);

CREATE INDEX idx_role_permission_role_code ON finance.role_permission(role_code);

-- Seed: Senior roles — full access to all modules
INSERT INTO finance.role_permission (role_code, module, can_view, can_create, can_approve, can_export)
SELECT r.role_code, m.module, true, true, true, true
FROM (
    VALUES
        ('HEAD_OF_OPERATIONS'),
        ('TREASURY_OPS_FINANCE_MGR'),
        ('TL_FINANCIAL_REPORTING'),
        ('FINOPS_MANAGER')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('journals'),
        ('reports'),
        ('budget'),
        ('fx_rates'),
        ('fixed_assets'),
        ('vendors'),
        ('payables'),
        ('receivables'),
        ('general_ledger')
) AS m(module)
ON CONFLICT (role_code, module) DO NOTHING;

-- Seed: Mid roles — module-specific permissions
INSERT INTO finance.role_permission (role_code, module, can_view, can_create, can_approve, can_export)
SELECT r.role_code, m.module, m.can_view, m.can_create, m.can_approve, m.can_export
FROM (
    VALUES
        ('FINANCE_OFFICER'),
        ('FINANCE_OPS_ASSOCIATE'),
        ('OPERATIONS_EXECUTIVE')
) AS r(role_code)
CROSS JOIN (
    VALUES
        ('journals',        true, true,  false, true),
        ('reports',         true, false, false, true),
        ('budget',          true, true,  false, true),
        ('fx_rates',        true, false, false, false),
        ('fixed_assets',    true, true,  false, true),
        ('vendors',         true, true,  false, true),
        ('payables',        true, true,  false, true),
        ('receivables',     true, true,  false, true),
        ('general_ledger',  true, false, false, true)
) AS m(module, can_view, can_create, can_approve, can_export)
ON CONFLICT (role_code, module) DO NOTHING;

-- Seed: View-only roles — view + export only on all modules
INSERT INTO finance.role_permission (role_code, module, can_view, can_create, can_approve, can_export)
SELECT r.role_code, m.module, true, false, false, true
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
        ('journals'),
        ('reports'),
        ('budget'),
        ('fx_rates'),
        ('fixed_assets'),
        ('vendors'),
        ('payables'),
        ('receivables'),
        ('general_ledger')
) AS m(module)
ON CONFLICT (role_code, module) DO NOTHING;

-- +goose Down

DROP TABLE IF EXISTS finance.role_permission;
