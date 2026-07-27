# PageOS

An AI-native operating system for Page Group, built as a Go modular monolith
with a Next.js frontend. First slice: **Page Capital client onboarding**.

- Architecture & plan: [`docs/onboarding-slice-plan.md`](docs/onboarding-slice-plan.md)
- Backend: Go, chi, pgx, sqlc, PostgreSQL (per-module schemas)
- Frontend: Next.js + TypeScript + Tailwind (design tokens)
- Object storage: S3 API (MinIO locally / staging, AWS S3 in prod)

## Layout

```
cmd/api            backend entrypoint
internal/platform  cross-cutting infra (config, db, http, observability)
internal/<module>  business modules (identity, organization, onboarding, ...)
db/migrations      goose SQL migrations (per-module schemas)
db/queries         sqlc source SQL
web/               Next.js frontend
openapi/           API contract (source of truth)
docs/              design docs
```

## Prerequisites

Go 1.25+, Node 22+, Docker + Compose. `goose` and `sqlc` run via `go run`
(no global install needed).

## Run locally (Docker)

```bash
cp .env.example .env
make up                 # postgres, minio, api, web
make migrate-up         # apply DB migrations (uses host Postgres port)
open http://localhost:3000
```

Service URLs (host ports chosen to coexist with other local stacks):
- Web: http://localhost:3000
- API: http://localhost:8081 (`/healthz`, `/readyz`)
- Postgres: localhost:5433
- MinIO console: http://localhost:9003 (API on :9002)

## Run backend without Docker

```bash
docker compose up -d postgres     # or your own Postgres
make migrate-up
make run                          # PAGEOS_DATABASE_URL from Makefile default
```

## Common tasks

```bash
make help          # list targets
make build         # build api binary
make test          # run tests
make migrate-up    # apply migrations
make sqlc          # regenerate type-safe DB code
```

## Status

- **M0** — runnable backend (health/readiness), Next.js status page, local
  Docker stack, migration + codegen tooling. ✅
- **M1 complete** ✅ — foundation modules:
  - `identity` — argon2id + server-side sessions, register/login/logout/me + auth middleware.
  - `organization` — subsidiary/department/position/person, effective-dated assignments, `ResolveHolders` temporal resolver.
  - `audit` — append-only log, written by every mutating capability.
  - `notification` — transactional outbox + SMTP dispatcher (NoOp when SMTP not configured).
  - `documents` — S3 `ObjectStore` interface (MinIO locally, AWS S3 in prod), multipart upload, scan lifecycle.
  - `broker` — external introducing-broker registry, commission in integer basis points.
  - **Reconciliation schema** — all 5 tables created (bank_account, statement, lines, internal_transaction, run, match); service layer is M3+.

Verified end-to-end against Postgres: migrations, auth flow, org CRUD, the
effective-dating resolver, and audit capture.
