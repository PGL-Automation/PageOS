-- +goose Up
-- Add family to organization.department so HR can classify each dept once
ALTER TABLE organization.department
  ADD COLUMN IF NOT EXISTS family text NOT NULL DEFAULT 'default'
  CHECK (family IN ('hr','finance','compliance','pm','wm','md','default'));

-- Add family to organization.position, defaulting to the dept family
ALTER TABLE organization.position
  ADD COLUMN IF NOT EXISTS family text NOT NULL DEFAULT 'default'
  CHECK (family IN ('hr','finance','compliance','pm','wm','md','default'));

-- ── Backfill organization.department ──────────────────────────────────────────
-- Map existing department names to families (case-insensitive)
UPDATE organization.department SET family = CASE
  WHEN lower(name) LIKE '%human capital%' OR lower(name) LIKE '%human resource%'
    OR lower(name) LIKE '% hr %'  OR lower(name) LIKE 'hr %'
    OR lower(name) LIKE '% hr'    OR lower(name) = 'hr'
    OR lower(name) LIKE '%payroll%' OR lower(name) LIKE '%recruitment%'
    OR lower(name) LIKE '%talent%'                              THEN 'hr'
  WHEN lower(name) LIKE '%executive%' OR lower(name) LIKE '%leadership%'
    OR lower(name) LIKE '%director%'  OR lower(name) LIKE '%managing director%'
    OR lower(name) LIKE '%group admin%'                         THEN 'md'
  WHEN lower(name) LIKE '%portfolio%' OR lower(name) LIKE '%investment%'
    OR lower(name) LIKE '%business development%'
    OR lower(name) LIKE '%equity%'                              THEN 'pm'
  WHEN lower(name) LIKE '%wealth%'                              THEN 'wm'
  WHEN lower(name) LIKE '%finance%' OR lower(name) LIKE '%financial%'
    OR lower(name) LIKE '%operations%' OR lower(name) LIKE '%treasury%'
    OR lower(name) LIKE '%accounting%' OR lower(name) LIKE '%reconcil%'
    OR lower(name) LIKE '%audit%'                               THEN 'finance'
  WHEN lower(name) LIKE '%compliance%' OR lower(name) LIKE '%risk%'
    OR lower(name) LIKE '%control%'    OR lower(name) LIKE '%aml%'
    OR lower(name) LIKE '%kyc%'        OR lower(name) LIKE '%regulatory%'
    OR lower(name) LIKE '%internal control%'                    THEN 'compliance'
  ELSE 'default'
END;

-- ── Backfill organization.position from position code (current roleFamily logic) ──
UPDATE organization.position SET family = CASE
  WHEN code LIKE 'HR_%'  OR code LIKE 'HC_%'  OR code LIKE '%_HR'
    OR code LIKE '%HUMAN_CAPITAL%' OR code LIKE '%PAYROLL%'
    OR code LIKE '%RECRUITMENT%'   OR code LIKE '%TALENT%'     THEN 'hr'
  WHEN code = 'GROUP_HEAD_WEALTH_MGMT'
    OR code = 'MANAGING_DIRECTOR'  OR code = 'GROUP_ADMIN'
    OR code LIKE '%DIRECTOR%'      OR code LIKE 'CEO%'
    OR code LIKE 'CXO%'                                         THEN 'md'
  WHEN code IN ('HEAD_OF_INVESTMENT','HEAD_INVESTMENT_MGMT',
                'GROUP_HEAD_BUSINESS_DEV','PORTFOLIO_MANAGER',
                'PORTFOLIO_MGMT_ASSISTANT','EQUITY_TRADER')     THEN 'pm'
  WHEN code LIKE '%WEALTH%' OR code LIKE '%RELATIONSHIP_MANAGER%'
    OR code LIKE 'RM_%'                                         THEN 'wm'
  WHEN code LIKE '%FINANCE%'  OR code LIKE '%FINANCIAL%'
    OR code LIKE '%FINOPS%'   OR code LIKE '%TREASURY%'
    OR code LIKE '%ACCOUNT%'  OR code LIKE '%RECONCILI%'
    OR code LIKE '%LEDGER%'   OR code LIKE '%AUDIT%'
    OR code LIKE '%OPERATIONS%'                                 THEN 'finance'
  WHEN code LIKE '%COMPLIANCE%' OR code LIKE '%RISK%'
    OR code LIKE '%AML%'        OR code LIKE '%KYC%'
    OR code LIKE '%REGULATORY%' OR code LIKE '%CONTROL%'
    OR code LIKE '%TRADE_MGMT%'                                 THEN 'compliance'
  ELSE 'default'
END;

-- After backfill, inherit department family for positions that still have 'default'
-- but belong to a classified department
UPDATE organization.position p
SET family = d.family
FROM organization.department d
WHERE p.department_id = d.id
  AND p.family = 'default'
  AND d.family != 'default';

-- +goose Down
ALTER TABLE organization.position DROP COLUMN IF EXISTS family;
ALTER TABLE organization.department DROP COLUMN IF EXISTS family;
