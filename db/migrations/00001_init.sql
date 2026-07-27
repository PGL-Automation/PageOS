-- +goose Up
-- Initial PageOS schema layout: one Postgres schema per module (modular
-- monolith). Tables land in later migrations as each module is built.
-- See docs/onboarding-slice-plan.md §3.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS approval;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS onboarding;

-- Shared extensions.
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- +goose Down
DROP SCHEMA IF EXISTS onboarding CASCADE;
DROP SCHEMA IF EXISTS documents CASCADE;
DROP SCHEMA IF EXISTS notification CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS approval CASCADE;
DROP SCHEMA IF EXISTS organization CASCADE;
DROP SCHEMA IF EXISTS identity CASCADE;
