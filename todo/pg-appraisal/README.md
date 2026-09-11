# Page Group Performance Appraisal System

A standalone-first, server-enforced performance-appraisal system for Page Group
(PCL, PAML, Shared Services). Balanced-Scorecard scoring differentiated by role and
grade, with the self → line-manager → Human Capital workflow, a Human Capital console,
and an org-data import module. Built to run independently of the HRIS.

> **Status:** functional application, validated end-to-end. Before it holds live
> appraisal data it needs a security review and Risk/Compliance sign-off, HTTPS, and
> secrets set via environment (see `DEPLOY.md`). Static per-person codes are fine to
> launch; email-OTP or SSO is the stronger production path.

## What enforces confidentiality
Authorisation is checked **on the server for every request**. An employee can load only
their own appraisal; a line manager only their direct reports (and their own); Human
Capital the group. The browser never receives another person's record — verified by the
smoke tests (cross-employee read → HTTP 403, employee → HC console → 403).

## Stack
- **Server:** Node.js + Express, SQLite (`better-sqlite3`) — low-ops, ideal for a single VPS
- **Auth:** server-side sessions (httpOnly cookie), per-person access codes hashed with bcrypt, login rate-limiting
- **Client:** React, bundled with esbuild, served as static assets by the app
- **Audit:** every login, view, save, submit and finalise is recorded

## Project layout
```
server/     domain.js (scorecards/scoring)  db.js  auth.js  orgdata.js  app.js  server.js
web/        index.html  src/app.jsx   (dist/app.js is built)
scripts/    seed.js  build-web.js
nginx/      appraisal.conf
roster.sample.csv   Dockerfile   docker-compose.yml   .env.example
```

## Run locally
```bash
npm install
npm run build          # bundle the React client
npm run seed           # load roster.sample.csv, open a cycle, write data/CODESHEET.txt
npm start              # http://localhost:8080  (set ports in docker-compose or env)
```
`data/CODESHEET.txt` lists each person's access code — distribute privately; it is
git-ignored and must never be committed. Sign in with a work email + code, e.g. Human
Capital is `adewale.bamiro@pagegroup.com`.

## Load your own roster
Human Capital → **Org data** tab: upload a CSV with columns
`Employee Name, Grade Level, Role, Job Title, Reports To, COMPANY, Email`. **Validate** runs the
checks (email format/uniqueness, grades, reporting lines, loops, duplicates); **Apply** loads
employees, sets emails and reporting lines, and creates appraisals for the current cycle.
Re-uploading an updated sheet updates existing people (existing access codes are preserved).

The **Employees** tab lets Human Capital edit an individual's login email or line manager, and
reissue their access code, at any time — no full re-upload needed. This is the standalone
data-load; an integration seam (the org-data layer) lets an HRIS feed be added later without a
rebuild.

## Deployment
See `DEPLOY.md` for VPS setup (Docker + nginx + TLS), the security-hardening checklist,
and backups.
