-- +goose Up
-- Payout approval module: payment accounts, beneficiaries, stand-ins,
-- payment requests, per-request approval steps, and immutable action log.
-- Instruction IDs (PAM-APR-YYYY-NNNNNN) are built in Go at submit time.

CREATE SCHEMA IF NOT EXISTS payout;

-- Payment accounts that funds are sent FROM (one per subsidiary / bank account).
CREATE TABLE payout.payment_account (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id  uuid        NOT NULL REFERENCES organization.subsidiary (id),
    bank_name      text        NOT NULL DEFAULT '',
    account_name   text        NOT NULL DEFAULT '',
    account_number text        NOT NULL,
    cut_off_time   time        NOT NULL DEFAULT '15:30',
    is_active      bool        NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, account_number)
);

CREATE INDEX payment_account_subsidiary_idx
    ON payout.payment_account (subsidiary_id)
    WHERE is_active = true;

-- Pre-registered beneficiary accounts for client payouts.
CREATE TABLE payout.client_beneficiary (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id  uuid        NOT NULL REFERENCES organization.subsidiary (id),
    client_name    text        NOT NULL,
    client_id      text        NOT NULL DEFAULT '',
    bank_name      text        NOT NULL,
    account_number text        NOT NULL,
    account_name   text        NOT NULL DEFAULT '',
    is_active      bool        NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subsidiary_id, account_number)
);

CREATE INDEX client_beneficiary_subsidiary_idx
    ON payout.client_beneficiary (subsidiary_id)
    WHERE is_active = true;

-- Stand-in coverage: when a user is unavailable, their steps are escalated
-- to cover_user_id.  One active row per covered user (UNIQUE on user_id).
CREATE TABLE payout.stand_in (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        UNIQUE,                    -- identity.users.id (who is covered)
    cover_user_id uuid,                                  -- identity.users.id (who covers them)
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Master payment request record.  Status reflects the current position in
-- the approval chain; fields are locked once status leaves 'draft'.
CREATE TABLE payout.payment_request (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    instruction_id       text        UNIQUE,             -- PAM-APR-2026-000001, set at submit
    subsidiary_id        uuid        NOT NULL REFERENCES organization.subsidiary (id),
    -- client_payout | liquidation | transfer | expense | placement
    request_type         text        NOT NULL
                             CHECK (request_type IN ('client_payout','liquidation','transfer','expense','placement')),
    payment_account_id   uuid        REFERENCES payout.payment_account (id),
    amount_kobo          bigint      NOT NULL CHECK (amount_kobo > 0),
    beneficiary_name     text        NOT NULL,
    beneficiary_bank     text        NOT NULL,
    beneficiary_account  text        NOT NULL,
    purpose              text        NOT NULL,
    supporting_doc_path  text        NOT NULL DEFAULT '',
    -- draft | submitted | head_concur | internal_control | compliance |
    -- finance_check | pending_signatories | approved | sent_to_bank |
    -- confirmed | reconciled | returned | rejected
    status               text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN (
                                 'draft','submitted','head_concur','internal_control',
                                 'compliance','finance_check','pending_signatories',
                                 'approved','sent_to_bank','confirmed','reconciled',
                                 'returned','rejected'
                             )),
    compliance_flagged   bool        NOT NULL DEFAULT false,
    raised_by            uuid        NOT NULL,           -- identity.users.id
    submitted_at         timestamptz,
    approved_at          timestamptz,
    bank_reference       text        NOT NULL DEFAULT '',
    confirmation_doc_path text       NOT NULL DEFAULT '',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_request_subsidiary_idx  ON payout.payment_request (subsidiary_id);
CREATE INDEX payment_request_status_idx      ON payout.payment_request (status);
CREATE INDEX payment_request_raised_by_idx   ON payout.payment_request (raised_by);

-- One row per approval step within a request.  step_order determines sequence.
-- due_by is computed from routing rules in Go at submit time.
CREATE TABLE payout.approval_step (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id     uuid        NOT NULL REFERENCES payout.payment_request (id) ON DELETE CASCADE,
    step_order     int         NOT NULL,
    -- head_concur | internal_control | compliance | finance_check |
    -- signatory_1 | signatory_2 | md | ceo
    step_type      text        NOT NULL
                       CHECK (step_type IN (
                           'head_concur','internal_control','compliance','finance_check',
                           'signatory_1','signatory_2','md','ceo'
                       )),
    assigned_to    uuid        NOT NULL,                 -- identity.users.id
    stand_in_for   uuid,                                 -- identity.users.id (if escalated)
    -- pending | approved | returned | rejected | skipped
    status         text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','returned','rejected','skipped')),
    due_by         timestamptz NOT NULL,
    reminder_sent_at  timestamptz,
    escalated_at      timestamptz,
    decided_at        timestamptz,
    notes          text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, step_order)
);

CREATE INDEX approval_step_request_idx     ON payout.approval_step (request_id);
CREATE INDEX approval_step_assigned_idx    ON payout.approval_step (assigned_to, status)
    WHERE status = 'pending';

-- Immutable audit trail.  Never deleted; cascades only for referential safety.
CREATE TABLE payout.action_log (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id    uuid        NOT NULL REFERENCES payout.payment_request (id) ON DELETE CASCADE,
    step_id       uuid,                                  -- payout.approval_step.id (nullable)
    actor_user_id uuid        NOT NULL,                  -- identity.users.id
    -- created | submitted | approved | returned | rejected | escalated | dispatched | confirmed
    action        text        NOT NULL
                      CHECK (action IN (
                          'created','submitted','approved','returned','rejected',
                          'escalated','dispatched','confirmed'
                      )),
    notes         text        NOT NULL DEFAULT '',
    source        text        NOT NULL DEFAULT 'web',    -- web | scheduler | system
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX action_log_request_idx ON payout.action_log (request_id);

-- PIN-based login additions to identity.users.
-- pin_hash: argon2id of the 4-6 digit PIN.
-- pin_attempts / pin_locked_until: brute-force lockout.
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS pin_hash         text;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS pin_attempts     int         NOT NULL DEFAULT 0;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

-- +goose Down
ALTER TABLE identity.users DROP COLUMN IF EXISTS pin_locked_until;
ALTER TABLE identity.users DROP COLUMN IF EXISTS pin_attempts;
ALTER TABLE identity.users DROP COLUMN IF EXISTS pin_hash;

DROP TABLE payout.action_log;
DROP TABLE payout.approval_step;
DROP TABLE payout.payment_request;
DROP TABLE payout.stand_in;
DROP TABLE payout.client_beneficiary;
DROP TABLE payout.payment_account;

DROP SCHEMA payout;
