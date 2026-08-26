-- +goose Up
-- CRM: Wealth Manager relationship management.
-- Covers prospects, clients, interactions, tasks, and opportunities.

CREATE SCHEMA IF NOT EXISTS crm;

-- ── Contacts — prospects, clients, referral sources ───────────────────────────

CREATE TABLE crm.contact (
    id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id          uuid          REFERENCES organization.subsidiary(id),
    rm_person_id           uuid          REFERENCES organization.person(id),  -- assigned RM
    rm_name                text          NOT NULL DEFAULT '',

    -- Identity
    first_name             text          NOT NULL,
    last_name              text          NOT NULL,
    company                text          NOT NULL DEFAULT '',
    job_title              text          NOT NULL DEFAULT '',
    email                  text          NOT NULL DEFAULT '',
    phone                  text          NOT NULL DEFAULT '',
    whatsapp               text          NOT NULL DEFAULT '',
    linkedin_url           text          NOT NULL DEFAULT '',
    address                text          NOT NULL DEFAULT '',

    -- Classification
    contact_type           text          NOT NULL DEFAULT 'prospect'
                               CHECK (contact_type IN ('prospect','client','referral_source','introducer','partner','other')),
    segment                text          NOT NULL DEFAULT 'retail'
                               CHECK (segment IN ('retail','hnw','uhnw','institutional','family_office')),
    stage                  text          NOT NULL DEFAULT 'new'
                               CHECK (stage IN ('new','contacted','qualified','proposal_sent','negotiation','converted','lost','dormant')),
    source                 text          NOT NULL DEFAULT ''
                               CHECK (source IN ('','referral','cold_call','event','social_media','website','walk_in','existing_client','other')),
    source_detail          text          NOT NULL DEFAULT '',  -- e.g. name of referrer

    -- Financial profile
    estimated_aum          numeric(18,2),      -- estimated investable assets (NGN)
    annual_income          numeric(18,2),
    risk_appetite          text          NOT NULL DEFAULT ''
                               CHECK (risk_appetite IN ('','conservative','moderate','balanced','aggressive','very_aggressive')),
    investment_goals       text[]        NOT NULL DEFAULT '{}',  -- e.g. ['retirement','wealth_growth','income']
    preferred_products     text[]        NOT NULL DEFAULT '{}',  -- e.g. ['equities','fixed_income','real_estate']

    -- Onboarding link — set when prospect is converted to an onboarding client
    onboarding_client_id   uuid,         -- references onboarding.client.id (cross-schema, no FK to avoid coupling)

    -- Referral network
    referred_by_contact_id uuid          REFERENCES crm.contact(id),

    -- Background
    background_notes       text          NOT NULL DEFAULT '',
    tags                   text[]        NOT NULL DEFAULT '{}',
    priority               text          NOT NULL DEFAULT 'medium'
                               CHECK (priority IN ('low','medium','high','vip')),

    -- Lifecycle
    last_interaction_at    timestamptz,
    next_followup_date     date,
    is_active              boolean       NOT NULL DEFAULT true,

    created_by             uuid          NOT NULL,
    created_by_name        text          NOT NULL DEFAULT '',
    created_at             timestamptz   NOT NULL DEFAULT now(),
    updated_at             timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_contact_rm          ON crm.contact (rm_person_id);
CREATE INDEX idx_crm_contact_stage       ON crm.contact (stage);
CREATE INDEX idx_crm_contact_type        ON crm.contact (contact_type);
CREATE INDEX idx_crm_contact_subsidiary  ON crm.contact (subsidiary_id);

-- ── Interactions — every client touchpoint ────────────────────────────────────

CREATE TABLE crm.interaction (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id       uuid          NOT NULL REFERENCES crm.contact(id) ON DELETE CASCADE,
    rm_person_id     uuid          REFERENCES organization.person(id),
    rm_name          text          NOT NULL DEFAULT '',

    type             text          NOT NULL
                         CHECK (type IN ('call','meeting','email','whatsapp','site_visit','event','video_call','other')),
    direction        text          NOT NULL DEFAULT 'outbound'
                         CHECK (direction IN ('inbound','outbound')),
    subject          text          NOT NULL DEFAULT '',
    notes            text          NOT NULL DEFAULT '',
    outcome          text          NOT NULL DEFAULT ''
                         CHECK (outcome IN ('','positive','neutral','negative','no_contact','scheduled_followup')),
    duration_mins    int,
    location         text          NOT NULL DEFAULT '',

    interaction_date timestamptz   NOT NULL DEFAULT now(),
    next_action      text          NOT NULL DEFAULT '',
    next_action_date date,

    created_by       uuid          NOT NULL,
    created_by_name  text          NOT NULL DEFAULT '',
    created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_interaction_contact ON crm.interaction (contact_id, interaction_date DESC);
CREATE INDEX idx_crm_interaction_rm      ON crm.interaction (rm_person_id);

-- ── Tasks — scheduled follow-ups and actions ──────────────────────────────────

CREATE TABLE crm.task (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id       uuid          REFERENCES crm.contact(id) ON DELETE CASCADE,
    assigned_to      uuid          REFERENCES organization.person(id),
    assigned_name    text          NOT NULL DEFAULT '',

    title            text          NOT NULL,
    description      text          NOT NULL DEFAULT '',
    task_type        text          NOT NULL DEFAULT 'follow_up'
                         CHECK (task_type IN ('call','meeting','email','proposal','kyc_docs','onboarding','portfolio_review','follow_up','other')),
    priority         text          NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low','medium','high','urgent')),
    status           text          NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','in_progress','completed','cancelled')),
    due_date         date,
    completed_at     timestamptz,
    completion_notes text          NOT NULL DEFAULT '',

    created_by       uuid          NOT NULL,
    created_by_name  text          NOT NULL DEFAULT '',
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_task_assignee ON crm.task (assigned_to, status);
CREATE INDEX idx_crm_task_contact  ON crm.task (contact_id);
CREATE INDEX idx_crm_task_due      ON crm.task (due_date) WHERE status NOT IN ('completed','cancelled');

-- ── Opportunities — investment deals in progress ──────────────────────────────

CREATE TABLE crm.opportunity (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      uuid          NOT NULL REFERENCES crm.contact(id) ON DELETE CASCADE,
    rm_person_id    uuid          REFERENCES organization.person(id),
    rm_name         text          NOT NULL DEFAULT '',

    title           text          NOT NULL,
    product         text          NOT NULL DEFAULT '',   -- e.g. "Fixed Income Fund", "Equity Mandate"
    estimated_value numeric(18,2),                       -- potential AUM (NGN)
    probability     int           NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
    stage           text          NOT NULL DEFAULT 'qualification'
                        CHECK (stage IN ('qualification','proposal','negotiation','verbal_commit','closed_won','closed_lost')),
    expected_close  date,
    actual_close    date,

    notes           text          NOT NULL DEFAULT '',
    lost_reason     text          NOT NULL DEFAULT '',

    created_by      uuid          NOT NULL,
    created_by_name text          NOT NULL DEFAULT '',
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_opportunity_contact ON crm.opportunity (contact_id);
CREATE INDEX idx_crm_opportunity_rm      ON crm.opportunity (rm_person_id, stage);

-- +goose Down
DROP TABLE IF EXISTS crm.opportunity;
DROP TABLE IF EXISTS crm.task;
DROP TABLE IF EXISTS crm.interaction;
DROP TABLE IF EXISTS crm.contact;
DROP SCHEMA  IF EXISTS crm;
