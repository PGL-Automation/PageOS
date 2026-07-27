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

Service URLs:
- Web: http://localhost:3000
- API: http://localhost:8080 (`/healthz`, `/readyz`)
- MinIO console: http://localhost:9001

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

M0 skeleton: runnable backend (health/readiness), Next.js status page wired to
the API, local Docker stack, migration + codegen tooling. Next: M1 foundation
modules (identity, organization, audit, notification, documents).
