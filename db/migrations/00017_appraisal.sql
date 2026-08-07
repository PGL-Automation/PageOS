-- +goose Up
-- Appraisal schema. Supports configurable appraisal cycles with weighted
-- questions, self-scoring, manager scoring, and reviewer assignments.

CREATE SCHEMA IF NOT EXISTS appraisal;

CREATE TABLE appraisal.cycle (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text        NOT NULL,
    description     text        NOT NULL DEFAULT '',
    subsidiary_id   uuid,                               -- nullable = group-wide; cross-schema ref, no FK
    status          text        NOT NULL DEFAULT 'draft', -- draft|open|closed|archived
    self_deadline   date,                               -- deadline for self-scoring
    manager_deadline date,                              -- deadline for manager scoring
    opened_at       timestamptz,
    closed_at       timestamptz,
    created_by      uuid        NOT NULL,               -- identity.users.id, cross-schema ref, no FK
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appraisal_cycle_status        ON appraisal.cycle (status);
CREATE INDEX idx_appraisal_cycle_subsidiary_id ON appraisal.cycle (subsidiary_id);

CREATE TABLE appraisal.question (
    id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id    uuid    NOT NULL REFERENCES appraisal.cycle (id) ON DELETE CASCADE,
    category    text    NOT NULL DEFAULT 'General',
    text        text    NOT NULL,
    description text    NOT NULL DEFAULT '',
    max_score   int     NOT NULL DEFAULT 5 CHECK (max_score > 0),
    weight      numeric(5,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
    order_index int     NOT NULL DEFAULT 0,
    created_by  uuid    NOT NULL,                       -- identity.users.id, cross-schema ref, no FK
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appraisal_question_cycle_id ON appraisal.question (cycle_id);

CREATE TABLE appraisal.submission (
    id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id              uuid    NOT NULL REFERENCES appraisal.cycle (id) ON DELETE CASCADE,
    appraisee_id          uuid    NOT NULL,             -- identity.users.id, cross-schema ref, no FK
    status                text    NOT NULL DEFAULT 'pending', -- pending|self_draft|self_submitted|manager_scoring|completed
    self_score            numeric(6,2),                 -- computed weighted score
    manager_score         numeric(6,2),                 -- computed weighted score
    self_submitted_at     timestamptz,
    manager_submitted_at  timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cycle_id, appraisee_id)
);

CREATE INDEX idx_appraisal_submission_cycle_id    ON appraisal.submission (cycle_id);
CREATE INDEX idx_appraisal_submission_appraisee_id ON appraisal.submission (appraisee_id);
CREATE INDEX idx_appraisal_submission_status       ON appraisal.submission (status);

CREATE TABLE appraisal.response (
    id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid    NOT NULL REFERENCES appraisal.submission (id) ON DELETE CASCADE,
    question_id   uuid    NOT NULL REFERENCES appraisal.question (id) ON DELETE CASCADE,
    scorer_id     uuid    NOT NULL,                     -- identity.users.id, cross-schema ref, no FK
    scorer_type   text    NOT NULL CHECK (scorer_type IN ('self', 'manager')),
    score         numeric(5,2) NOT NULL CHECK (score >= 0),
    comment       text    NOT NULL DEFAULT '',
    scored_at     timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (submission_id, question_id, scorer_type)
);

CREATE INDEX idx_appraisal_response_submission_id ON appraisal.response (submission_id);
CREATE INDEX idx_appraisal_response_question_id   ON appraisal.response (question_id);
CREATE INDEX idx_appraisal_response_scorer_id      ON appraisal.response (scorer_id);

CREATE TABLE appraisal.reviewer_assignment (
    id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id     uuid    NOT NULL REFERENCES appraisal.cycle (id) ON DELETE CASCADE,
    appraisee_id uuid    NOT NULL,                      -- identity.users.id, cross-schema ref, no FK
    reviewer_id  uuid    NOT NULL,                      -- identity.users.id, cross-schema ref, no FK
    assigned_by  uuid    NOT NULL,                      -- identity.users.id, cross-schema ref, no FK
    assigned_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cycle_id, appraisee_id)
);

CREATE INDEX idx_appraisal_reviewer_assignment_cycle_id     ON appraisal.reviewer_assignment (cycle_id);
CREATE INDEX idx_appraisal_reviewer_assignment_appraisee_id ON appraisal.reviewer_assignment (appraisee_id);
CREATE INDEX idx_appraisal_reviewer_assignment_reviewer_id  ON appraisal.reviewer_assignment (reviewer_id);

-- +goose Down
DROP TABLE appraisal.reviewer_assignment;
DROP TABLE appraisal.response;
DROP TABLE appraisal.submission;
DROP TABLE appraisal.question;
DROP TABLE appraisal.cycle;
DROP SCHEMA appraisal;
