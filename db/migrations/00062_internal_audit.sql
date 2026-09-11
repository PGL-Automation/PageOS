-- +goose Up

CREATE SCHEMA IF NOT EXISTS internal_audit;
CREATE SCHEMA IF NOT EXISTS risk_mgmt;

-- Control Review Queue items
CREATE TABLE internal_audit.review_item (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_no            TEXT        NOT NULL UNIQUE,
    title                   TEXT        NOT NULL,
    item_type               TEXT        NOT NULL,
    business_unit           TEXT        NOT NULL,
    risk_level              TEXT        NOT NULL DEFAULT 'medium',
    status                  TEXT        NOT NULL DEFAULT 'pending_review',
    priority                TEXT        NOT NULL DEFAULT 'normal',
    submitter_id            UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    submitter_name          TEXT        NOT NULL DEFAULT '',
    assigned_reviewer_id    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    assigned_reviewer_name  TEXT        NOT NULL DEFAULT '',
    submission_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date                TIMESTAMPTZ,
    review_started_at       TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    compliance_required     BOOLEAN     NOT NULL DEFAULT false,
    compliance_cleared      BOOLEAN,
    compliance_cleared_by   UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    compliance_cleared_at   TIMESTAMPTZ,
    description             TEXT        NOT NULL DEFAULT '',
    instructions            TEXT        NOT NULL DEFAULT '',
    linked_client_ref       TEXT        NOT NULL DEFAULT '',
    linked_transaction_ref  TEXT        NOT NULL DEFAULT '',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail of every action taken on a review item
CREATE TABLE internal_audit.review_action (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id  UUID        NOT NULL REFERENCES internal_audit.review_item(id) ON DELETE CASCADE,
    action          TEXT        NOT NULL,
    actor_id        UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    actor_name      TEXT        NOT NULL DEFAULT '',
    comments        TEXT        NOT NULL,
    previous_status TEXT        NOT NULL DEFAULT '',
    new_status      TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents uploaded as evidence for a review item
CREATE TABLE internal_audit.review_document (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id  UUID        NOT NULL REFERENCES internal_audit.review_item(id) ON DELETE CASCADE,
    file_name       TEXT        NOT NULL,
    storage_key     TEXT        NOT NULL DEFAULT '',
    file_size       BIGINT      NOT NULL DEFAULT 0,
    content_type    TEXT        NOT NULL DEFAULT '',
    document_type   TEXT        NOT NULL DEFAULT 'other',
    uploaded_by     UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    uploader_name   TEXT        NOT NULL DEFAULT '',
    version         INT         NOT NULL DEFAULT 1,
    is_current      BOOLEAN     NOT NULL DEFAULT true,
    notes           TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document checklist templates per review type
CREATE TABLE internal_audit.checklist_template (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type   TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_by  UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE internal_audit.checklist_template_item (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  UUID        NOT NULL REFERENCES internal_audit.checklist_template(id) ON DELETE CASCADE,
    seq          INT         NOT NULL DEFAULT 0,
    label        TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    is_mandatory BOOLEAN     NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-review checklist items (seeded from template or added manually)
CREATE TABLE internal_audit.review_checklist_item (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id    UUID        NOT NULL REFERENCES internal_audit.review_item(id) ON DELETE CASCADE,
    template_item_id  UUID        REFERENCES internal_audit.checklist_template_item(id) ON DELETE SET NULL,
    seq               INT         NOT NULL DEFAULT 0,
    label             TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'outstanding',
    reviewer_comments TEXT        NOT NULL DEFAULT '',
    document_id       UUID        REFERENCES internal_audit.review_document(id) ON DELETE SET NULL,
    validated_by      UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    validated_by_name TEXT        NOT NULL DEFAULT '',
    validated_at      TIMESTAMPTZ,
    is_mandatory      BOOLEAN     NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exceptions raised during review
CREATE TABLE internal_audit.review_exception (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id    UUID        NOT NULL REFERENCES internal_audit.review_item(id) ON DELETE CASCADE,
    title             TEXT        NOT NULL,
    description       TEXT        NOT NULL,
    severity          TEXT        NOT NULL DEFAULT 'medium',
    status            TEXT        NOT NULL DEFAULT 'open',
    owner_id          UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    owner_name        TEXT        NOT NULL DEFAULT '',
    corrective_action TEXT        NOT NULL DEFAULT '',
    due_date          DATE,
    resolved_at       TIMESTAMPTZ,
    raised_by         UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    raised_by_name    TEXT        NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 2: Risk Management scaffolding
CREATE TABLE risk_mgmt.rcsa (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    department        TEXT        NOT NULL,
    risk_description  TEXT        NOT NULL,
    risk_category     TEXT        NOT NULL DEFAULT '',
    cause             TEXT        NOT NULL DEFAULT '',
    existing_controls TEXT        NOT NULL DEFAULT '',
    likelihood        TEXT        NOT NULL DEFAULT '',
    impact            TEXT        NOT NULL DEFAULT '',
    residual_risk     TEXT        NOT NULL DEFAULT '',
    action_owner      TEXT        NOT NULL DEFAULT '',
    review_date       DATE,
    status            TEXT        NOT NULL DEFAULT 'draft',
    created_by        UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_mgmt.key_risk_indicator (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    threshold_green NUMERIC,
    threshold_amber NUMERIC,
    threshold_red   NUMERIC,
    current_value   NUMERIC,
    unit            TEXT        NOT NULL DEFAULT '',
    trend           TEXT        NOT NULL DEFAULT 'stable',
    traffic_light   TEXT        NOT NULL DEFAULT 'green',
    owner           TEXT        NOT NULL DEFAULT '',
    breach_action   TEXT        NOT NULL DEFAULT '',
    last_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_mgmt.risk_register (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    department        TEXT        NOT NULL,
    risk_title        TEXT        NOT NULL,
    risk_description  TEXT        NOT NULL DEFAULT '',
    risk_category     TEXT        NOT NULL DEFAULT '',
    linked_controls   TEXT        NOT NULL DEFAULT '',
    incidents         TEXT        NOT NULL DEFAULT '',
    remediation_plan  TEXT        NOT NULL DEFAULT '',
    likelihood        TEXT        NOT NULL DEFAULT '',
    impact            TEXT        NOT NULL DEFAULT '',
    residual_risk     TEXT        NOT NULL DEFAULT '',
    owner_id          UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    review_date       DATE,
    status            TEXT        NOT NULL DEFAULT 'open',
    created_by        UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_mgmt.stop_loss_entry (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument            TEXT        NOT NULL,
    portfolio             TEXT        NOT NULL DEFAULT '',
    approved_limit        NUMERIC,
    current_market_value  NUMERIC,
    loss_position         NUMERIC,
    breach_status         TEXT        NOT NULL DEFAULT 'within_limit',
    action_required       TEXT        NOT NULL DEFAULT '',
    data_source           TEXT        NOT NULL DEFAULT 'manual_upload',
    valuation_date        DATE,
    recorded_by           UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_mgmt.counterparty_exposure (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    counterparty        TEXT        NOT NULL,
    exposure_type       TEXT        NOT NULL DEFAULT '',
    current_exposure    NUMERIC,
    total_exposure      NUMERIC,
    approved_limit      NUMERIC,
    maturity_profile    TEXT        NOT NULL DEFAULT '',
    concentration_flag  BOOLEAN     NOT NULL DEFAULT false,
    data_source         TEXT        NOT NULL DEFAULT 'manual_upload',
    valuation_date      DATE,
    recorded_by         UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 2: Internal Audit module scaffolding
CREATE TABLE internal_audit.audit_plan (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    year             INT         NOT NULL,
    title            TEXT        NOT NULL,
    audit_universe   TEXT        NOT NULL DEFAULT '',
    scope            TEXT        NOT NULL DEFAULT '',
    objectives       TEXT        NOT NULL DEFAULT '',
    risk_rating      TEXT        NOT NULL DEFAULT 'medium',
    owner_id         UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    status           TEXT        NOT NULL DEFAULT 'draft',
    timetable_start  DATE,
    timetable_end    DATE,
    created_by       UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE internal_audit.audit_finding (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id               UUID        REFERENCES internal_audit.audit_plan(id) ON DELETE SET NULL,
    reference_no          TEXT        NOT NULL UNIQUE,
    title                 TEXT        NOT NULL,
    finding_description   TEXT        NOT NULL DEFAULT '',
    root_cause            TEXT        NOT NULL DEFAULT '',
    risk_rating           TEXT        NOT NULL DEFAULT 'medium',
    recommendation        TEXT        NOT NULL DEFAULT '',
    management_response   TEXT        NOT NULL DEFAULT '',
    owner_id              UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    owner_name            TEXT        NOT NULL DEFAULT '',
    due_date              DATE,
    status                TEXT        NOT NULL DEFAULT 'open',
    evidence_of_closure   TEXT        NOT NULL DEFAULT '',
    closed_at             TIMESTAMPTZ,
    created_by            UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_review_item_status   ON internal_audit.review_item(status);
CREATE INDEX idx_review_item_assignee ON internal_audit.review_item(assigned_reviewer_id);
CREATE INDEX idx_review_item_due_date ON internal_audit.review_item(due_date);
CREATE INDEX idx_review_item_business ON internal_audit.review_item(business_unit);
CREATE INDEX idx_review_action_item   ON internal_audit.review_action(review_item_id);
CREATE INDEX idx_review_doc_item      ON internal_audit.review_document(review_item_id);
CREATE INDEX idx_checklist_item_review ON internal_audit.review_checklist_item(review_item_id);
CREATE INDEX idx_exception_item       ON internal_audit.review_exception(review_item_id);
CREATE INDEX idx_exception_status     ON internal_audit.review_exception(status);

-- Seed default checklist templates
INSERT INTO internal_audit.checklist_template (item_type, name, description) VALUES
  ('client_instruction',  'Client Instruction Checklist',   'Controls for WM client withdrawal and deposit instructions'),
  ('investment_schedule', 'Investment Schedule Checklist',  'Controls for PM daily investment schedules'),
  ('account_opening',     'Account Opening Checklist',      'Controls for Finance account-opening documents'),
  ('kyc_validation',      'KYC Validation Checklist',       'Controls for KYC evidence and Compliance clearance'),
  ('symplus_posting',     'Symplus Posting Checklist',       'Controls for Finance Symplus posting reviews'),
  ('bank_reconciliation', 'Bank Reconciliation Checklist',  'Controls for bank reconciliation documents');

INSERT INTO internal_audit.checklist_template_item (template_id, seq, label)
SELECT t.id, v.seq, v.label FROM internal_audit.checklist_template t,
  (VALUES (1,'Client instruction form received'),(2,'Client authority verified'),(3,'Required approvals obtained'),(4,'Compliance status confirmed'),(5,'Supporting documents attached')) AS v(seq,label)
WHERE t.item_type = 'client_instruction';

INSERT INTO internal_audit.checklist_template_item (template_id, seq, label)
SELECT t.id, v.seq, v.label FROM internal_audit.checklist_template t,
  (VALUES (1,'Schedule completeness confirmed'),(2,'Approved limits checked'),(3,'Transaction support documents attached'),(4,'Posting status verified'),(5,'Exceptions noted and explained')) AS v(seq,label)
WHERE t.item_type = 'investment_schedule';

INSERT INTO internal_audit.checklist_template_item (template_id, seq, label)
SELECT t.id, v.seq, v.label FROM internal_audit.checklist_template t,
  (VALUES (1,'Account opening form received'),(2,'Compliance clearance confirmed'),(3,'KYC documents received'),(4,'Required approvals obtained'),(5,'Completion status verified')) AS v(seq,label)
WHERE t.item_type = 'account_opening';

INSERT INTO internal_audit.checklist_template_item (template_id, seq, label)
SELECT t.id, v.seq, v.label FROM internal_audit.checklist_template t,
  (VALUES (1,'Postings reviewed against source documents'),(2,'Omissions identified and flagged'),(3,'Duplicate entries checked'),(4,'Incorrect entries flagged'),(5,'Sign-off obtained')) AS v(seq,label)
WHERE t.item_type = 'symplus_posting';

INSERT INTO internal_audit.checklist_template_item (template_id, seq, label)
SELECT t.id, v.seq, v.label FROM internal_audit.checklist_template t,
  (VALUES (1,'Opening and closing balances confirmed'),(2,'Reconciling items listed and explained'),(3,'Unresolved differences documented'),(4,'Bank statement received and matched'),(5,'Supervisor sign-off obtained')) AS v(seq,label)
WHERE t.item_type = 'bank_reconciliation';

-- +goose Down
DROP TABLE IF EXISTS internal_audit.audit_finding;
DROP TABLE IF EXISTS internal_audit.audit_plan;
DROP TABLE IF EXISTS risk_mgmt.counterparty_exposure;
DROP TABLE IF EXISTS risk_mgmt.stop_loss_entry;
DROP TABLE IF EXISTS risk_mgmt.risk_register;
DROP TABLE IF EXISTS risk_mgmt.key_risk_indicator;
DROP TABLE IF EXISTS risk_mgmt.rcsa;
DROP TABLE IF EXISTS internal_audit.review_exception;
DROP TABLE IF EXISTS internal_audit.review_checklist_item;
DROP TABLE IF EXISTS internal_audit.checklist_template_item;
DROP TABLE IF EXISTS internal_audit.checklist_template;
DROP TABLE IF EXISTS internal_audit.review_document;
DROP TABLE IF EXISTS internal_audit.review_action;
DROP TABLE IF EXISTS internal_audit.review_item;
DROP SCHEMA IF EXISTS risk_mgmt;
DROP SCHEMA IF EXISTS internal_audit;
