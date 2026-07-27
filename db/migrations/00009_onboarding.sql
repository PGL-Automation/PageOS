-- +goose Up
-- Onboarding domain: the core M2 slice. All money-related amounts are stored
-- as integer kobo (minor units) — never float.

-- The customer identity. Reused across future products.
CREATE TABLE onboarding.client (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id uuid        NOT NULL,  -- organization.subsidiary
    client_type   text        NOT NULL DEFAULT 'individual', -- individual | joint | corporate
    display_name  text        NOT NULL,
    status        text        NOT NULL DEFAULT 'prospect', -- prospect | active | inactive | closed
    broker_id     uuid        REFERENCES onboarding.broker (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_subsidiary_idx ON onboarding.client (subsidiary_id);
CREATE INDEX client_broker_idx ON onboarding.client (broker_id) WHERE broker_id IS NOT NULL;

-- One application process per client (a client may have multiple cases over
-- time — e.g. re-onboarding after lapse). The case drives the process;
-- application_data holds the content.
CREATE TABLE onboarding.onboarding_case (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid        NOT NULL REFERENCES onboarding.client (id),
    subsidiary_id           uuid        NOT NULL,
    client_type             text        NOT NULL DEFAULT 'individual',
    requirement_set_version int         NOT NULL DEFAULT 1,
    -- State machine: draft → submitted → in_review → compliance_review → approved
    --                                  ↳ returned → (back to draft)
    --                                               ↳ rejected
    state                   text        NOT NULL DEFAULT 'draft',
    risk_flag               boolean     NOT NULL DEFAULT false,
    risk_notes              text        NOT NULL DEFAULT '',
    return_count            int         NOT NULL DEFAULT 0,
    return_notes            text        NOT NULL DEFAULT '',
    initiated_by            uuid        NOT NULL,  -- identity.users.id
    tnc_version             text        NOT NULL DEFAULT '',
    tnc_accepted_at         timestamptz,
    submitted_at            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_client_idx ON onboarding.onboarding_case (client_id);
CREATE INDEX case_state_idx  ON onboarding.onboarding_case (state, subsidiary_id);

-- Structured form fields from the account-opening form (PAGE Account Opening
-- Form.pdf). Stable KYC-critical fields are columns; long tail goes to JSONB.
CREATE TABLE onboarding.application_data (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 1:1 with the case; UNIQUE enforced here.
    case_id uuid NOT NULL UNIQUE REFERENCES onboarding.onboarding_case (id),

    -- Personal
    full_name           text    NOT NULL DEFAULT '',
    gender              text    NOT NULL DEFAULT '',
    mothers_maiden_name text    NOT NULL DEFAULT '',
    date_of_birth       date,
    place_of_birth      text    NOT NULL DEFAULT '',
    country_of_origin   text    NOT NULL DEFAULT '',
    place_of_residence  text    NOT NULL DEFAULT '',
    residential_address text    NOT NULL DEFAULT '',
    is_us_person        boolean NOT NULL DEFAULT false,
    us_address          text    NOT NULL DEFAULT '',
    phone_numbers       text[]  NOT NULL DEFAULT '{}',
    email               text    NOT NULL DEFAULT '',
    tin                 text    NOT NULL DEFAULT '',

    -- Next of kin
    next_of_kin_name    text    NOT NULL DEFAULT '',
    next_of_kin_email   text    NOT NULL DEFAULT '',
    next_of_kin_phone   text    NOT NULL DEFAULT '',

    -- Employment
    employer            text    NOT NULL DEFAULT '',
    employer_address    text    NOT NULL DEFAULT '',
    official_email      text    NOT NULL DEFAULT '',
    official_phone      text    NOT NULL DEFAULT '',

    -- PEP (Political Exposed Person)
    is_pep              boolean NOT NULL DEFAULT false,
    pep_position        text    NOT NULL DEFAULT '',
    pep_period          text    NOT NULL DEFAULT '',

    -- Social media (optional; stored as JSONB — not queried programmatically)
    social_media        jsonb   NOT NULL DEFAULT '{}'::jsonb,

    -- Investment details
    source_of_funds     text    NOT NULL DEFAULT '',
    source_of_wealth    text    NOT NULL DEFAULT '',
    investment_purpose  text    NOT NULL DEFAULT '',
    investment_amount_kobo   bigint  NOT NULL DEFAULT 0,
    investment_amount_words  text    NOT NULL DEFAULT '',
    tenor               text    NOT NULL DEFAULT '',
    interest_rate_bps   int     NOT NULL DEFAULT 0,

    -- Payout bank account
    bank_name           text    NOT NULL DEFAULT '',
    bank_account_name   text    NOT NULL DEFAULT '',
    bank_account_number text    NOT NULL DEFAULT '',
    bvn                 text    NOT NULL DEFAULT '',
    sort_code           text    NOT NULL DEFAULT '',

    -- Declaration / consent
    declaration_legal_capacity boolean NOT NULL DEFAULT false,
    declaration_info_correct   boolean NOT NULL DEFAULT false,
    declaration_tnc_accepted   boolean NOT NULL DEFAULT false,
    declaration_min_holding    boolean NOT NULL DEFAULT false,

    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Per-case materialization of the requirement set. One row per required/
-- conditional item; updated whenever application data changes.
CREATE TABLE onboarding.requirement_instance (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         uuid        NOT NULL REFERENCES onboarding.onboarding_case (id),
    requirement_key text        NOT NULL,
    label           text        NOT NULL,
    category        text        NOT NULL,   -- document | field | consent
    obligation      text        NOT NULL,   -- required | optional | conditional
    -- pending | satisfied | not_applicable
    status          text        NOT NULL DEFAULT 'pending',
    document_id     uuid,                   -- documents.document.id (set when satisfied by a doc)
    satisfied_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (case_id, requirement_key)
);

CREATE INDEX req_instance_case_idx ON onboarding.requirement_instance (case_id, status);

-- Append-only RM → Client relationship history. Auto-ended when RM is
-- deactivated (see docs §16); manually reassigned otherwise.
CREATE TABLE onboarding.rm_client (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid        NOT NULL REFERENCES onboarding.client (id),
    rm_person_id  uuid        NOT NULL,  -- organization.person.id
    subsidiary_id uuid        NOT NULL,
    assigned_at   timestamptz NOT NULL DEFAULT now(),
    assigned_by   uuid        NOT NULL,  -- identity.users.id
    ended_at      timestamptz
);

CREATE UNIQUE INDEX rm_client_active_idx ON onboarding.rm_client (client_id)
    WHERE ended_at IS NULL;

CREATE INDEX rm_client_rm_idx ON onboarding.rm_client (rm_person_id, ended_at);

-- +goose Down
DROP TABLE onboarding.rm_client;
DROP TABLE onboarding.requirement_instance;
DROP TABLE onboarding.application_data;
DROP TABLE onboarding.onboarding_case;
DROP TABLE onboarding.client;
