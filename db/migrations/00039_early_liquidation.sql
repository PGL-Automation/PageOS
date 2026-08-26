-- +goose Up
-- Early liquidation, penalty fees, and WHT support.

-- ── Fund-level penalty terms (defaults for accounts in this fund) ─────────────

ALTER TABLE portfolio.fund
    ADD COLUMN tenor_days               int,                   -- NULL = open-ended
    ADD COLUMN lock_up_days             int  NOT NULL DEFAULT 0,
    ADD COLUMN early_redemption_allowed boolean NOT NULL DEFAULT true,
    ADD COLUMN penalty_type             text NOT NULL DEFAULT 'none'
                    CHECK (penalty_type IN ('reduced_rate','flat_fee','interest_forfeit','none')),
    ADD COLUMN full_rate                numeric(5,2),          -- agreed rate at full tenor (% p.a.)
    ADD COLUMN early_exit_rate          numeric(5,2),          -- rate applied on early exit
    ADD COLUMN penalty_rate             numeric(5,2),          -- % for flat_fee / interest_forfeit
    ADD COLUMN notice_period_days       int  NOT NULL DEFAULT 0;

-- ── Client account — investment terms and maturity ────────────────────────────

ALTER TABLE portfolio.client_account
    ADD COLUMN client_type      text  NOT NULL DEFAULT 'corporate'
                    CHECK (client_type IN ('individual','corporate')),
    ADD COLUMN tenor_days       int,                   -- overrides fund.tenor_days if set
    ADD COLUMN investment_date  date,                  -- set on first subscription
    ADD COLUMN maturity_date    date,                  -- investment_date + tenor_days
    ADD COLUMN agreed_rate      numeric(5,2),          -- locked-in rate for this account
    ADD COLUMN wht_rate         numeric(5,2)           -- 15% individual / 10% corporate
                    GENERATED ALWAYS AS (
                        CASE client_type WHEN 'individual' THEN 15.0 ELSE 10.0 END
                    ) STORED;

-- ── Client transaction — penalty and WHT detail ───────────────────────────────

ALTER TABLE portfolio.client_transaction
    ADD COLUMN is_early_redemption      boolean       NOT NULL DEFAULT false,
    ADD COLUMN days_held                int,
    ADD COLUMN full_accrued_interest    numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN actual_accrued_interest  numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN penalty_amount           numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN penalty_type             text          NOT NULL DEFAULT 'none',
    ADD COLUMN wht_amount               numeric(18,2) NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE portfolio.client_transaction
    DROP COLUMN IF EXISTS is_early_redemption,
    DROP COLUMN IF EXISTS days_held,
    DROP COLUMN IF EXISTS full_accrued_interest,
    DROP COLUMN IF EXISTS actual_accrued_interest,
    DROP COLUMN IF EXISTS penalty_amount,
    DROP COLUMN IF EXISTS penalty_type,
    DROP COLUMN IF EXISTS wht_amount;

ALTER TABLE portfolio.client_account
    DROP COLUMN IF EXISTS client_type,
    DROP COLUMN IF EXISTS tenor_days,
    DROP COLUMN IF EXISTS investment_date,
    DROP COLUMN IF EXISTS maturity_date,
    DROP COLUMN IF EXISTS agreed_rate,
    DROP COLUMN IF EXISTS wht_rate;

ALTER TABLE portfolio.fund
    DROP COLUMN IF EXISTS tenor_days,
    DROP COLUMN IF EXISTS lock_up_days,
    DROP COLUMN IF EXISTS early_redemption_allowed,
    DROP COLUMN IF EXISTS penalty_type,
    DROP COLUMN IF EXISTS full_rate,
    DROP COLUMN IF EXISTS early_exit_rate,
    DROP COLUMN IF EXISTS penalty_rate,
    DROP COLUMN IF EXISTS notice_period_days;
