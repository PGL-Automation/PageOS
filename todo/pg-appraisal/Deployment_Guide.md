# Page Group Performance Appraisal — Deployment Guide

A practical, step-by-step guide to standing up the appraisal system on a VPS, distributing
access, and running a review cycle. Pair this with the **Deployment Checklist** workbook for
tracking sign-off.

> **Responsibility & boundary.** This guide and the codebase are provided to your team.
> Provisioning the server, and the security review and Risk/Compliance (NDPA/DPIA) sign-off
> required before the system holds live appraisal data, are Page Group's to carry out. The
> author of the code cannot deploy to your infrastructure.

---

## 1. What you are deploying

A standalone Node.js application with a built-in SQLite database and a React interface, fronted
by nginx with HTTPS. It enforces confidentiality on the server (each person is only ever sent
their own data), runs the self → line-manager → Human Capital workflow, and lets Human Capital
import the employee roster and manage access. No HRIS connection is required.

**Prerequisites**
- A VPS (Ubuntu/Debian recommended), 1 vCPU / 1–2 GB RAM is ample for hundreds of users.
- A DNS record (e.g. `appraisal.yourdomain`) pointing at the VPS.
- Docker (recommended) *or* Node.js 18+ with build tools.
- Optional: SMTP credentials, if you want codes delivered by email.

---

## 2. Deploy — Option A: Docker (recommended)

1. **Install Docker** (Engine + compose plugin) on the VPS.
2. **Copy the project** to the server, e.g. `/opt/pg-appraisal`.
3. **Set the hostname** in `nginx/appraisal.conf` (replace `appraisal.pagegroup.example`).
4. **Create `.env`** from `.env.example` and set `APP_URL` (and SMTP if using email — see §5).
5. **TLS certificate** (Let's Encrypt):
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --standalone -d appraisal.yourdomain
   sudo cp -rL /etc/letsencrypt ./nginx/certs
   ```
6. **Build, seed once, start:**
   ```bash
   docker compose build
   docker compose run --rm app npm run seed     # first run only — loads roster, opens a cycle
   docker compose up -d
   ```
7. **Get the access-code sheet** to distribute privately:
   ```bash
   docker compose run --rm app cat /app/data/CODESHEET.txt
   ```
8. Visit `https://appraisal.yourdomain` and sign in as Human Capital.

The database and code sheet persist on the `appdata` Docker volume.

---

## 3. Deploy — Option B: Node + pm2 (no Docker)

```bash
sudo apt-get install -y nodejs npm build-essential python3   # Node 18+; build tools for better-sqlite3
cd /opt/pg-appraisal
npm ci
npm run build
cp .env.example .env          # edit NODE_ENV=production, PORT=8080, DB_PATH, APP_URL, SMTP (optional)
npm run seed
sudo npm i -g pm2
pm2 start server/server.js --name pg-appraisal
pm2 save && pm2 startup
```
Install nginx on the host, use `nginx/appraisal.conf` (point `proxy_pass` to
`http://127.0.0.1:8080`), and issue TLS with `certbot --nginx -d appraisal.yourdomain`.

---

## 4. Load your people (Human Capital)

You can seed from the sample roster, but for real use, load your own sheet:

1. Prepare a CSV with columns **Employee Name, Grade Level, Role, Job Title, Reports To,
   COMPANY, Email** (see the *Employee Sheet* template). One row per person, including all
   managers, the CEO (blank *Reports To*), and the HR head (role containing "Head" +
   "Human Resources").
2. Sign in as Human Capital → **Org data** tab → **Validate** (dry run: flags bad grades,
   unresolved/looping reporting lines, duplicate emails) → fix anything flagged → **Apply**.
3. **Employees** tab lets you correct an individual's login email or line manager, and reissue
   a code, at any time.
4. **Cycle** tab opens/closes the review window. Employees can only complete appraisals while
   the cycle is open.

Re-uploading an updated sheet updates existing people and preserves their codes; only new
joiners get new codes.

---

## 5. Access codes & email (credentials)

**Default (no email):** on Apply, each appraisee gets a system-generated 6-digit code, stored
hashed. The plaintext is written once to `data/CODESHEET.txt` for Human Capital to distribute
privately. People sign in with **work email + code**.

**With email enabled (optional):** set the SMTP block in `.env`:
```
APP_URL=https://appraisal.yourdomain
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Page Group Performance <no-reply@pagegroup.com>
```
Then:
- **"Email me a sign-in code"** appears on the login screen — sends a one-time code (10-minute,
  single-use) to the work email held on the employee record (never to an address typed at
  sign-in). Login accepts the standing code *or* a valid one-time code.
- **Apply** and **Reissue code** email the code to the recipient automatically.

Email is a lighter-weight stand-in for corporate **SSO**, which remains the strongest option
and would plug into the same login flow later. Restart the app after changing `.env`.

> Codes and passwords are never placed in the roster sheet — only emails (the login identity).

---

## 6. Security hardening checklist (before live data)

- [ ] HTTPS only; HTTP redirects to HTTPS (nginx config does this). Cookies are `secure` in production.
- [ ] Secrets in `.env`, not committed. `.env` and `data/CODESHEET.txt` are git-ignored.
- [ ] Prefer email one-time codes or SSO over long-lived static codes for go-live.
- [ ] Distribute codes privately; delete the code sheet from the server afterwards.
- [ ] Firewall: expose only 80/443; block the app port from the public internet.
- [ ] Tighten Content-Security-Policy in nginx once asset origins are confirmed.
- [ ] Run the container/process as a non-root user; restrict DB file permissions.
- [ ] Back up the `data/` volume regularly and test a restore.
- [ ] Complete the DPIA and Risk/Compliance sign-off (NDPA) before the first live cycle.
- [ ] Review the `audit` table retention against policy.
- [ ] Keep the base image, Node, and dependencies patched.

---

## 7. Backups

The whole state is the SQLite database.
```bash
# Docker — consistent (WAL-safe) backup
docker compose exec app sh -c "sqlite3 /app/data/appraisal.db \".backup '/app/data/backup-$(date +%F).db'\""
# then copy the backup off-box (scp / object storage)
```
Or snapshot the `appdata` volume while the app is briefly stopped.

---

## 8. Running a cycle (operational flow)

1. Human Capital verifies the roster (Org data → Validate → Apply) and confirms reporting lines
   with HODs (pre-cycle freeze-and-confirm).
2. Open the cycle (Cycle tab). Distribute codes (sheet or email).
3. Employees complete self-assessment → submit to line manager.
4. Managers review, set agreed ratings → submit to Human Capital.
5. Human Capital calibrates and finalises; export the results (Appraisals → Export CSV).
6. Close the cycle.

---

## 9. Troubleshooting

- **`better-sqlite3` build fails (Option B):** ensure `build-essential` and `python3` are
  installed; Node 18+. The Docker image installs these automatically.
- **Login rejected:** confirm the email matches the employee record exactly and the cycle exists;
  codes are case-sensitive digits. Reissue from the Employees tab if needed.
- **"Email not configured" on login:** SMTP isn't set — use the code sheet, or set the SMTP block
  and restart.
- **TLS/cookie issues:** the app must be behind HTTPS in production (`NODE_ENV=production`) so the
  session cookie is sent; check nginx is forwarding `X-Forwarded-Proto`.
- **Reset the demo:** stop the app, delete `data/appraisal.db*`, re-run `npm run seed`.

---

## 10. Upgrades & re-imports

- To update people mid-cycle, re-upload the roster (Org data → Apply) or edit individuals in the
  Employees tab.
- To deploy a new build: rebuild the image / `npm ci && npm run build`, keep the `data/` volume,
  restart. The database and codes are preserved.
