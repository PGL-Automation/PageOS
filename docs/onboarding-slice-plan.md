# PageOS — First Slice Implementation Plan: Page Capital Client Onboarding

Status: LIVE · Updated: 2026-07-22 · Owner: 'Nonso
Source spec: `PAGE Account Opening Form.pdf` (repo root)

This plan describes the first production slice of PageOS: **Page Capital client (account-opening) onboarding**. It builds only the platform primitives this slice needs, in a way that every later module reuses. Nothing here is built "for the future" beyond what this slice genuinely exercises.

---

## 1. Goal & scope

**Goal:** A Relationship Manager (Wealth Manager) can create a client onboarding application, capture the account-opening form data, collect the required KYC documents, submit it through an internal review chain (Wealth Manager → Managing Director (optional) → Compliance Manager), and reach an "Approved / Account Opened" outcome — fully audited and notified at each step.

**In scope (v1):**
- Client type: **Individual** only (Corporate added next as the deliberate "second example").
- Initiation: **RM-initiated** (internal staff). Customer self-service portal is v2.
- Structured capture of the account-opening form fields.
- **Conditional requirement set** (fields + documents) with required / optional / conditional obligations.
- Document upload against per-requirement slots (managed object storage).
- Internal **position-based review/approval** with return-for-correction, via the shared approval core.
- Manual **compliance checklist** (PEP, source of funds/wealth, ID, BVN, utility bill, duplicate check).
- Versioned **Terms & Conditions** acceptance capture.
- Audit trail + email notifications.
- Everything routed through a **capability layer** (single governed choke point) so UI, API, and future agents call the same functions.

**Explicitly deferred (must earn its way in):**
- Corporate/Joint client type (next slice — validates the requirement-set abstraction).
- Customer self-service portal + external auth.
- Automated KYC (BVN API, sanctions/PEP screening, OCR/extraction) — designed as swappable capabilities, implemented later.
- MCP/agent tools server (design contracts now, expose later).
- Rules DSL / admin config UI for requirement sets (hardcode in Go until a 3rd case differs).
- Conversational/chat UI.
- Broker commission *calculation* module (rate is stored now; arithmetic against investment amounts deferred until investment flows are live).
- Reconciliation auto-matching engine / agent (interface built now; auto-matcher deferred).

---

## 2. Architecture at a glance

- **Backend:** Go, **modular monolith**, Clean Architecture / DDD, capability-oriented.
- **Persistence:** **sqlc + pgx** on **PostgreSQL**, one instance, **per-module schemas**.
- **Decoupling:** in-process event bus + **transactional outbox** (broker deferred).
- **API:** REST/JSON, resource-oriented, described by **OpenAPI** (single contract → UI codegen + future agent tools).
- **Frontend:** **Next.js + TypeScript**, **TanStack Query** with an OpenAPI-generated typed client, **Tailwind + shadcn/ui + Framer Motion**, design tokens from day one.
- **Object storage:** managed S3-compatible bucket; file metadata in Postgres.
- **Principle:** neither the UI nor any agent touches the DB — all mutations go through capabilities with authz + validation + idempotency + audit.

---

## 3. Module layout (Go)

```
pageos/
├── cmd/
│   └── api/                    # main entrypoint (HTTP server, wiring)
├── internal/
│   ├── platform/               # cross-cutting infra (no business logic)
│   │   ├── config/
│   │   ├── db/                 # pgx pool, tx helpers
│   │   ├── outbox/             # transactional outbox writer + dispatcher
│   │   ├── eventbus/           # in-process pub/sub
│   │   ├── httpx/              # router, middleware, error mapping
│   │   ├── authz/              # authorization checks
│   │   └── observability/      # logging, tracing, metrics
│   ├── identity/               # users, sessions, authn
│   ├── organization/           # subsidiary, department, position, assignment
│   ├── approval/               # the lean shared approval core
│   ├── audit/                  # append-only audit log
│   ├── notification/           # email dispatch (outbox-driven)
│   ├── documents/              # object storage + doc metadata + slots
│   └── onboarding/             # THIS slice's domain module
│       ├── domain/             # entities, requirement sets, state machine
│       ├── app/                # capabilities (application services)
│       ├── store/              # sqlc queries + repository impls
│       └── http/               # REST handlers for onboarding
├── db/
│   ├── migrations/             # goose/atlas SQL migrations, per schema
│   └── queries/                # sqlc .sql files per module
├── openapi/                    # spec (source of truth for the API)
└── docs/
```

Each module exposes a small Go **interface** (its capabilities) consumed by others; cross-module reads happen via those interfaces or via subscribed events, never by querying another module's tables.

---

## 4. Domain model (onboarding)

Core entities:

- **Client (party)** — the customer identity, reusable across future products.
  `id, client_type (individual|joint|corporate), display_name, status (prospect|active|...), subsidiary_id, created_at`
- **OnboardingCase** — one application instance with a state machine.
  `id, client_id, subsidiary_id, requirement_set_version_id, state, initiated_by (assignment_id), tnc_version_id, created_at, ...`
- **ApplicationData** — the structured form fields (see §5), stored as validated columns for the stable core + JSONB for the long tail. Keyed to the case.
- **RequirementInstance** — the concrete checklist for THIS case, materialized from the requirement set + answers (see §6).
- **Document** — an uploaded file bound to a requirement instance (see §7).
- **ComplianceCheck** — one manual/automated check with outcome (see §9).
- Review/approval lives in the **approval** module, referenced by `resource_type='onboarding_case', resource_id=<case id>`.

### Onboarding state machine

```
DRAFT ──submit──▶ SUBMITTED ──begin review──▶ IN_REVIEW
  ▲                                              │
  │                              ┌───────────────┼───────────────┐
  └──── returned (with notes) ◀──┤ RETURN        │ approve step  │
                                 └───────────────┼───────────────┘
                                                 ▼
                                        COMPLIANCE_REVIEW
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                   ▼                  ▼
                          APPROVED            RETURNED           REJECTED
                        (Account Opened)
```

Transitions are driven by approval-core events (`ApprovalStepApproved`, `ApprovalReturned`, `ApprovalRejected`, `ApprovalApproved`) that the onboarding module subscribes to — the workflow is not hardcoded into handlers.

---

## 5. The account-opening form (structured capture)

Fields grouped as on the PDF. Stable, queried fields become columns; the rest go to JSONB.

- **Personal:** full name (surname first), gender, mother's maiden name, DOB, place of birth, country of origin, place of residence, residential address, phone(s), email, TIN, next of kin (name/email/phone).
- **Conditional personal:** joint individuals' names (joint only), US correspondence address (US person only).
- **Employment:** current employer, employer address, official email/phone.
- **Political questionnaire (PEP):** `is_pep (bool)`, position occupied, period. → feeds a compliance check.
- **Social media:** facebook/instagram/twitter/linkedin (all optional).
- **Investment details:** source of funds, source of wealth, purpose, amount (figures + words), tenor, interest rate.
- **Account details (payout):** bank name, account name, account number, **BVN**, sort code.
- **Declaration & consent:** legal-capacity/age attestation, information-correctness, evidence-of-funds attached, **T&C acceptance (versioned)**, minimum-holding-period agreement.

> Note: figures/words amount and interest/tenor are captured but **no money moves** in this slice — they're KYC/suitability context only.

---

## 6. Requirement-set model (the heart of the slice)

The form is a **conditional requirement set**, not a flat form. Model it leanly:

- **RequirementSet** — versioned, per `client_type`. `id, client_type, version, effective_from, items[]`.
- **RequirementItem** — `key, label, category (field|document|consent), obligation (required|optional|conditional), condition (predicate), doc_constraints (accepted mime types, max size, min recency e.g. utility bill < 3 months)`.
- **Conditions are plain Go predicates per client type — NO DSL, NO config UI.** The two client types already justify the *structure* (second-example rule); a third differing case justifies extracting configuration later.

Individual requirement set (v1), documents from PDF page 4:

| key | category | obligation | condition |
|---|---|---|---|
| passport_photo | document | required | — |
| valid_id | document | required | — |
| utility_bill | document | required | recency < 3 months |
| email_indemnity_form | document | required | — |
| birth_certificate_minor | document | conditional | `applicant_is_minor OR has_minor_beneficiary` |
| us_correspondence_address | field | conditional | `is_us_person` |
| joint_individuals | field | conditional | `client_type == joint` |
| tnc_acceptance | consent | required | — |

When a case is created/edited, the engine **materializes RequirementInstances** from the set + current answers: each instance is `pending | satisfied | waived | not_applicable`. A case is **submit-eligible** only when all `required` + triggered `conditional` items are satisfied. This completeness check is a single capability — later an agent can run/verify it.

Corporate set (next slice) adds the 10 corporate docs and validates that the abstraction holds without code changes to the engine.

---

## 7. Document infrastructure

- **Storage:** **S3 API** as the contract, behind a small `ObjectStore` Go interface (`Put/Get/Delete/SignedURL`) so the backing service is swappable (AWS S3, MinIO self-hosted on the VPS, Backblaze B2, etc.) — portability by design. Files **never** in Postgres. Use the AWS SDK v2 with a configurable endpoint so any S3-compatible service works with no code change.
- **Document (metadata) table:** `id, case_id, requirement_key, storage_key, filename, mime, size, checksum, version, uploaded_by, scan_status, created_at`.
- **Upload flow:** validate mime/size against `doc_constraints` → store → enqueue **malware scan** → mark `scan_status`; a doc counts as satisfying its slot only when `clean`.
- **Versioning:** re-upload creates a new version; originals retained (immutable).
- **Security:** encryption at rest; access scoped to Page Capital Compliance + the assigned RM (authz check on every read); signed, short-lived download URLs.
- **Retention:** a policy hook field; actual purge deferred.
- **Agent hook (later):** classification ("is this really a utility bill?") and extraction (OCR ID → prefill/verify) as capabilities acting on the same documents.

---

## 8. Review & approval (reuses the approval core)

The "FOR OFFICIAL PURPOSES ONLY" chain is the approval core's first consumer:

- Steps resolve to **positions**, not people: `Wealth Manager → Managing Director (optional) → Compliance Manager`.
- The **MD step is conditional/optional** — v1: the routing function includes the MD step **only when the case carries a risk flag** (e.g. PEP=yes, sanctions/watchlist hit, high-risk source of funds, or a compliance-raised flag); otherwise it's skipped. Hardcoded in Go, no policy DSL. The risk flag is a field on the case set by the political questionnaire answer and by compliance checks.
- Actions: **approve / reject / return-for-correction** (return sends the case back to DRAFT with notes to the RM).
- Terminal events (`ApprovalApproved/Rejected/Returned`) are emitted; the onboarding module subscribes and advances its own state machine + triggers account-opened side effects.
- Position resolution uses **organization** + effective-dated **assignments**, so approvals survive staff moves/promotions and past decisions are reconstructable.

Approval core stays lean: `approval_request` (references `resource_type + resource_id + JSONB context`), ordered `approval_step`, approvers resolved at runtime, append-only decisions. Deferred: delegation, escalation, SLA, quorum/parallel voting.

---

## 9. Compliance / KYC

v1 = a **manual checklist** a Compliance Manager completes during `COMPLIANCE_REVIEW`. Each check runs through a `ScreeningProvider` Go interface with a **manual implementation now** and an **API implementation later** (BVN vendor, sanctions/PEP screening) swapped in without touching the workflow — the check type, inputs, and outcome shape stay identical:

- PEP screening (from the political questionnaire)
- Sanctions / watchlist screening
- Source of funds / source of wealth review
- ID verification (valid means of ID)
- BVN validation
- Address verification (utility bill < 3 months)
- Duplicate / existing-client check (against **PageOS's own** client records; no legacy data exists yet, so no legacy lookup in v1)

Each check: `id, case_id, type, outcome (pass|fail|needs_info), notes, source (manual|api), performed_by, performed_at`. A `fail` on a screening check raises the case **risk flag** (which pulls in the MD approval step). Compliance approval is blocked until all required checks are `pass`.

---

## 10. Capability layer & API

- Every action is a **capability** (application service) with a typed input/output contract, authz, validation, idempotency key, and audit emission. Examples:
  `CreateOnboardingCase`, `UpdateApplicationData`, `UploadDocument`, `EvaluateRequirements`, `SubmitCase`, `RecordApprovalDecision`, `RecordComplianceCheck`, `ApproveCase`.
- **OpenAPI is the single source of truth** → generate the TypeScript client for the UI now; the same contracts become MCP tool schemas later. One definition, three consumers.
- Idempotency on all mutations (agents/retries).

---

## 11. Cross-cutting

- **Identity/auth:** **build a minimal identity module** — email/password with a strong hash (argon2id), server-side sessions, password reset, and a place to add MFA later. No third-party IdP. Roles/positions come from `organization`, not baked into identity. Design the external-customer surface as separate, added in v2.
- **Audit:** append-only, every capability writes an entry (actor, action, resource, before/after or event ref). Non-negotiable for a financial system.
- **Notification:** outbox-driven email on each state change (submitted, returned, approved, rejected) — the form's "Notices" clause effectively requires this.
- **Observability:** structured logs, request tracing, basic metrics from day one (over-invest here — solo dev).
- **Config:** typed config; secrets injected per environment (never in Terraform state or git). See §15 for the infra/secrets approach.

---

## 12. Frontend surfaces

- **Adaptive application form** — reveals fields/questions by client type + conditional answers; save-as-draft; inline validation.
- **Document center** — one slot per requirement instance showing required/optional/received/missing + scan status + a live completeness meter.
- **RM dashboard** — the RM's onboarding pipeline by state.
- **Compliance review queue** — view application + documents, run/record checks, approve/reject/return with notes, full audit view.
- Craft: design tokens (color/type/spacing/radius/shadow/motion), shadcn components, tasteful Framer Motion. Professional first, distinctive second.

---

## 13. Build sequence (milestones)

0. **M-infra — Environments & IaC:** Terraform for staging + prod on the VPS (see §15); Docker images, Compose stacks per env, Postgres + object store + reverse proxy/TLS, remote TF state, CI/CD skeleton. Stand up staging first.
1. **M0 — Skeleton:** repo, Go modular-monolith wiring, Postgres + migration tool, sqlc, config, logging/tracing, health check, OpenAPI scaffold, Next.js app + design tokens + typed client codegen.
2. **M1 — Foundation modules:** identity (minimal staff auth — argon2id + sessions), organization (subsidiary/department/position/assignment + effective dating), audit, notification (outbox), documents (S3 ObjectStore interface + slots + scan stub).
3. **M2 — Requirement engine + onboarding domain:** RequirementSet/Item + Individual set, OnboardingCase + state machine, ApplicationData, EvaluateRequirements, capabilities up to SubmitCase.
4. **M3 — Approval core + review chain:** approval module, position resolvers, onboarding routing function (WM → MD-optional → Compliance), event subscriptions advancing state.
5. **M4 — Compliance + close-out:** manual compliance checks, T&C versioning, APPROVED/Account-Opened side effects + notifications.
6. **M5 — UI polish + e2e:** all four surfaces, end-to-end tests of the happy path + return-for-correction, observability review.
7. **M6 — Second example:** Corporate client type — validates the requirement-set abstraction with no engine changes. (Separate slice.)

---

## 14. Resolved decisions (2026-07-21)

1. **Auth:** minimal in-house identity module (argon2id + server-side sessions). No third-party IdP.
2. **MD-optional rule:** MD step included **only when the case is risk-flagged** (PEP, screening fail, or compliance-raised). Otherwise skipped.
3. **Object storage:** **S3 API** behind a swappable `ObjectStore` interface; backing service portable (AWS S3 / self-hosted MinIO / B2).
4. **KYC screening:** manual now via a `ScreeningProvider` interface; API implementations (BVN, sanctions/PEP) swap in later with no workflow change.
5. **Legacy data:** none exists yet — no legacy lookup. Duplicate-client check runs against PageOS's own records only.
6. **Deployment:** self-managed **VPS**, **two environments (staging + prod)**, **Terraform** as IaC. See §15.

---

## 15. Infrastructure, environments & deployment

**Targets & trajectory:** **staging on a Hostinger VPS now**; **prod on AWS later** (intent is a full AWS move). Two environments, **separate hosts** (confirmed). IaC via **Terraform**. → **Portability is a first-class constraint:** the app stack must be identical on Hostinger and AWS, with only the infra layer differing per provider.

**Portability principle:** the app is provider-agnostic already — Docker images, Postgres via pgx, storage via the `ObjectStore` S3 interface. Moving staging→AWS-prod is then: MinIO → AWS S3 (endpoint swap, no code change), self-managed Postgres → RDS (optional), the VPS box → EC2/ECS. Nothing in the application layer changes.

**Topology:**
- **Staging (Hostinger):** one Docker Compose stack — `api` (Go), `web` (Next.js), `postgres` (volume), `minio` (self-hosted S3), `caddy` (reverse proxy + automatic Let's Encrypt TLS), optional `clamav` (malware scan).
- **Prod (AWS, later):** same Compose stack on EC2 to start (fastest lift-and-shift), then optionally decompose to ECS + RDS + real S3 when it's worth it. Same images, same config shape.

**Terraform layout & reality check:**
```
infra/
├── modules/
│   ├── aws-app/       # (prod) EC2/ECS, security groups, S3, Route53 — full TF
│   ├── dns/           # DNS records (Hostinger for staging / Route53 for prod)
│   └── bootstrap/     # cloud-init + user data shared shape
└── envs/
    ├── staging/       # Hostinger: thin TF (DNS) + Ansible/cloud-init provisions the box
    └── prod/          # AWS: full TF (compute + storage + DNS)
```
- **Honest caveat:** **Hostinger has no first-class Terraform provider.** For staging, treat the box as a generic SSH VPS — provision it with **cloud-init + a bootstrap/Ansible script** (Docker, users, firewall), and let Terraform own only DNS records (Hostinger DNS API where available, else managed manually). The full Terraform payoff arrives with AWS prod. Building the `envs/` structure now still pays off — the AWS move slots into `envs/prod` cleanly.
- **Per-env directories** (not workspaces) — clearest for a solo dev; separate state + variables.
- **Remote state:** use a **dedicated AWS S3 bucket** for TF state from day one (native S3 lockfile locking, `use_lockfile = true`). Rationale: you're AWS-bound anyway, and it avoids the chicken-and-egg of storing state in the MinIO that Terraform/bootstrap provisions.
- **App deployment stays out of Terraform** — TF provisions infra; CI/CD deploys apps.

**Build & deploy (CI/CD, minimal):**
- GitHub Actions: on merge → build & test → build Docker images → push to **GHCR** → deploy to the target env over SSH (`docker compose pull && up -d`) + run DB migrations.
- Staging deploys on merge to `main`; prod deploys on a tagged release (manual approval gate).

**Data & operations:**
- **Postgres:** containerized with a persistent volume per env; **automated nightly `pg_dump` to object storage** (MinIO on staging; later S3) with retention. Managed Postgres/RDS stays an option later — pgx code is agnostic.
- **DNS:** managed at Hostinger for now (staging + prod records); revisit moving to Route53 when prod lands on AWS.
- **Secrets:** never in Terraform state or git. Per-env secrets delivered as an env file on the host (root-owned, 0600) or **SOPS-encrypted** in the repo. TF variables marked `sensitive`.
- **Backups & restore drill:** verify a restore from backup before go-live.
- **Observability:** ship logs/metrics from both envs; alert on prod.

_All prior infra unknowns are now resolved (see §14 + this section). AWS prod specifics (EC2 vs ECS, RDS vs self-managed PG) are deferred until the actual AWS migration._

---

## 16. Relationship Manager management (added 2026-07-22)

RMs are staff members already modeled as `organization.person` assigned to the `WEALTH_MANAGER` position. What is new is a first-class, persistent **RM→Client relationship** that survives beyond any single onboarding case.

**New table: `onboarding.rm_client`**
```
id              uuid PK
client_id       uuid NOT NULL FK → onboarding.client
rm_person_id    uuid NOT NULL FK → organization.person
subsidiary_id   uuid NOT NULL FK → organization.subsidiary
assigned_at     timestamptz NOT NULL DEFAULT now()
assigned_by     uuid NOT NULL FK → identity.users
ended_at        timestamptz  -- NULL = currently active
```
- A client has **0 or 1 active RM** at any time (enforced: only one row where `ended_at IS NULL` per client).
- Assignment is **optional** — clients without an RM are fully valid.
- **Reassignment** closes the current row (`ended_at = now()`) and opens a new one. Full history preserved.
- When an RM's `identity.users` account is disabled or their assignment in `organization.assignment` ends, all their active RM→Client rows are **automatically ended** (`ended_at = now()`). Clients are then unassigned — must be manually reassigned. No ghost assignments.
- **Capabilities:** `AssignClientToRM`, `ReassignClient`, `UnassignClient`, `ListRMClients(rmPersonID)`.
- When an RM initiates an onboarding case, the client is auto-linked to that RM (as a convenience, not a constraint — the RM–client bond is independent of any case).
- **Future:** RM dashboard showing their full client portfolio + performance.

---

## 17. Broker management (added 2026-07-22)

Brokers are **external parties** (individuals or companies) who introduce clients. They are not staff and have no login in v1.

**New table: `onboarding.broker`**
```
id                  uuid PK
subsidiary_id       uuid NOT NULL FK → organization.subsidiary
code                text NOT NULL UNIQUE (per subsidiary)
name                text NOT NULL
type                text NOT NULL DEFAULT 'individual'  -- individual | corporate
email               text
phone               text
commission_rate_bps integer NOT NULL DEFAULT 0  -- basis points; 150 = 1.50%
status              text NOT NULL DEFAULT 'active'
created_at          timestamptz NOT NULL DEFAULT now()
```

- Commission stored as **integer basis points** — no floating-point error; 150 = 1.50 %.
- `onboarding.client` gets an optional `broker_id` FK (set at onboarding, fixed thereafter — **one broker per client**, confirmed).
- Commission *calculation* (rate × invested principal) is **deferred** until investment/liquidation flows are live; the rate is on the record now so reporting is available immediately.
- **Capabilities:** `CreateBroker`, `UpdateBrokerCommissionRate`, `ListBrokers`, `GetBrokerClients(brokerID)`.
- **Future reporting:** `BrokerStatement(brokerID, period)` — client list, amounts invested/redeemed, commissions earned. All fields exist now; the report is a query.

---

## 18. Bank reconciliation infrastructure (added 2026-07-22)

Reconciliation matches the **bank's view** (statement) against **PageOS's internal ledger** (what the system recorded). It is a module with its own Postgres schema (`reconciliation`).

### Components

**A. Bank accounts registry** — `reconciliation.bank_account`
The company's own accounts, one row per account per subsidiary. Reconciliation runs are scoped to a single account.

**B. Bank statement import** — `reconciliation.bank_statement` + `reconciliation.bank_statement_line`
- A statement is an uploaded file (→ `documents` module for storage) + parsed rows.
- `bank_statement_line`: `(id, statement_id, txn_date, value_date, debit, credit, balance, narration, reference, raw)` — `raw` preserves the original text/row verbatim.
- **Parser interface** (Go):
  ```go
  type StatementParser interface {
      Parse(r io.Reader) ([]StatementLine, error)
  }
  ```
  First implementation: a **configurable CSV/Excel parser** with a column-mapping config per bank (bank name → column positions/names). Because multiple banks are in scope and each has a slightly different format, the mapping is stored as JSONB on `bank_account` (e.g. `{"date_col":"Date","debit_col":"Debit","narration_col":"Remarks"}`). Adding a new bank = add a config row, no code change.

**C. Internal transaction ledger** — `reconciliation.internal_transaction`
PageOS's own record of every money movement it considers real:
`(id, subsidiary_id, bank_account_id, type investment_receipt|liquidation_payout|fee|interest|adjustment, direction credit|debit, amount_kobo bigint, currency, reference, client_id, related_type, related_id, txn_date, recorded_at)`
- Amounts stored as **integer kobo/minor units** (no floats).
- Written to by financial capabilities (investment approval, liquidation approval) — these are the "what PageOS thinks should have happened."

**D. Reconciliation run** — `reconciliation.reconciliation_run`
One run per bank account per period. Status: `draft → in_progress → closed` (closed = immutable).

**E. Match table** — `reconciliation.reconciliation_match`
`(id, run_id, bank_line_id, internal_txn_id, match_type auto|manual, confidence_pct, matched_by, notes, status matched|unmatched_bank|unmatched_internal|adjustment)`
- A bank line may be unmatched (no internal record found), and vice versa.
- Unmatched items block closing a run.

### Matching strategy (swappable interface)
```go
type MatchingStrategy interface {
    Match(bankLines []StatementLine, internalTxns []InternalTransaction) []Match
}
```
- **v1:** exact-match by amount + date (±1 day) + reference substring.
- **v2:** fuzzy/AI agent match. Same interface, just a better implementation.

### What to build in v1
- All five DB tables (schema, migrations, sqlc).
- `CreateBankAccount`, `UploadStatement` (parse + store lines), `CreateReconciliationRun`, `RecordMatch`, `ListUnmatched`, `CloseRun` capabilities.
- The `StatementParser` interface + one generic CSV implementation with column-map config.
- The `MatchingStrategy` interface + exact-match implementation.
- No UI yet — API only. Reconciler UI is M5.

### Key design decisions (confirmed 2026-07-22)
- **Multiple banks:** pluggable parser + JSONB column-map per account. No hardcoded bank format.
- **Amounts:** integer minor units (kobo) throughout. Never `float`.
- **Immutability:** once a run is `closed`, its matches are append-only. Corrections go into a new run or adjustment entries.
- **Agent hook:** the `MatchingStrategy` interface is where an AI agent plugs in later (fuzzy narration match, bulk transfer splitting, etc.).
