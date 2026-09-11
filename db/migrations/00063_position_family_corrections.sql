-- +goose Up
-- Authoritative family override for every known position code.
-- This runs after the pattern-based backfill in 00059 and corrects any
-- positions that were misclassified by the CASE/LIKE rules.
--
-- Family meanings:
--   wm         Wealth Management — client pipeline, CRM, portfolios, commission
--   pm         Portfolio Management — asset register, liquidity, ALM, reports
--   md         Executive/MD — team overview, cross-function visibility
--   hr         Human Capital — people records, leave, payroll, appraisal management
--   finance    Finance & Operations — journals, GL, reconciliation, payroll runs
--   compliance Internal Audit/Control/Risk — review queue, risk reports
--   default    General staff — own appraisal, leave, approvals only

UPDATE organization.position SET family = CASE code

  -- ── Wealth Management ───────────────────────────────────────────────────────
  -- GROUP_HEAD_WEALTH_MGMT must be "wm" so they get WM_NAV with CRM, pipeline,
  -- interactions, client list, commission. They were incorrectly set to "md" by
  -- the pattern backfill because the code contains no "WEALTH" substring.
  WHEN 'GROUP_HEAD_WEALTH_MGMT'     THEN 'wm'
  WHEN 'WEALTH_MANAGER'             THEN 'wm'
  WHEN 'RELATIONSHIP_MANAGER'       THEN 'wm'

  -- ── Portfolio Management ─────────────────────────────────────────────────────
  WHEN 'HEAD_OF_INVESTMENT'         THEN 'pm'
  WHEN 'HEAD_INVESTMENT_MGMT'       THEN 'pm'
  WHEN 'GROUP_HEAD_BUSINESS_DEV'    THEN 'pm'
  WHEN 'PORTFOLIO_MANAGER'          THEN 'pm'
  WHEN 'PORTFOLIO_MGMT_ASSISTANT'   THEN 'pm'
  WHEN 'EQUITY_TRADER'              THEN 'pm'
  WHEN 'INVESTMENT_ANALYST'         THEN 'pm'
  WHEN 'FUND_MANAGER'               THEN 'pm'

  -- ── Executive / MD ───────────────────────────────────────────────────────────
  WHEN 'MANAGING_DIRECTOR'          THEN 'md'
  WHEN 'EXECUTIVE_DIRECTOR'         THEN 'md'
  WHEN 'GROUP_ADMIN'                THEN 'md'

  -- ── HR / Human Capital ───────────────────────────────────────────────────────
  WHEN 'HEAD_HR'                    THEN 'hr'
  WHEN 'HEAD_HUMAN_CAPITAL'         THEN 'hr'
  WHEN 'HR_MANAGER'                 THEN 'hr'
  WHEN 'HR_OFFICER'                 THEN 'hr'
  WHEN 'HR_OPS_MANAGER'             THEN 'hr'
  WHEN 'HR_ADMIN'                   THEN 'hr'
  WHEN 'HC_OFFICER'                 THEN 'hr'
  WHEN 'HC_MANAGER'                 THEN 'hr'

  -- ── Finance & Operations ─────────────────────────────────────────────────────
  WHEN 'HEAD_OF_OPERATIONS'         THEN 'finance'
  WHEN 'TREASURY_OPS_FINANCE_MGR'   THEN 'finance'
  WHEN 'TL_FINANCIAL_REPORTING'     THEN 'finance'
  WHEN 'FINOPS_MANAGER'             THEN 'finance'
  WHEN 'FUND_TREASURY_OPERATIONS'   THEN 'finance'
  WHEN 'RECONCILIATION_OFFICER'     THEN 'finance'
  WHEN 'FINANCE_OFFICER'            THEN 'finance'
  WHEN 'FINANCE_OPS_ASSOCIATE'      THEN 'finance'
  WHEN 'TREASURY_ANALYST'           THEN 'finance'
  WHEN 'OPERATIONS_EXECUTIVE'       THEN 'finance'
  WHEN 'OPERATIONS_ASSOCIATE'       THEN 'finance'

  -- ── Compliance / Internal Audit / Risk ───────────────────────────────────────
  WHEN 'HEAD_CORPORATE_COMPLIANCE'  THEN 'compliance'
  WHEN 'HEAD_COMPLIANCE_CORPORATE'  THEN 'compliance'
  WHEN 'HEAD_RISK_TRADE_MGMT'       THEN 'compliance'
  WHEN 'INTERNAL_CONTROL_OFFICER'   THEN 'compliance'
  WHEN 'TL_RESEARCH_RISK_MGMT'      THEN 'compliance'
  WHEN 'TRADING_RESEARCH_ANALYST'   THEN 'compliance'
  WHEN 'QUANT_MARKET_ANALYST'       THEN 'compliance'

  -- ── General / Default ────────────────────────────────────────────────────────
  WHEN 'IT_ADMIN'                   THEN 'default'
  WHEN 'IT_SUPPORT'                 THEN 'default'
  WHEN 'LEAD_SOFTWARE_ENGINEER'     THEN 'default'
  WHEN 'ADMIN_OFFICER'              THEN 'default'
  WHEN 'ADMIN_LOGISTICS_OFFICER'    THEN 'default'
  WHEN 'BRAND_STRATEGY_MANAGER'     THEN 'default'
  WHEN 'COMPLIANCE_MANAGER'         THEN 'compliance'

  -- Keep existing value for any code not listed above
  ELSE family
END;

-- +goose Down
-- No safe rollback — family values were overwritten. Re-run 00059 backfill if needed.
