# Deployment & Security Guide

This deploys the appraisal system on a single VPS behind nginx with HTTPS. It assumes a
Debian/Ubuntu server and a DNS record pointing your hostname at the VPS.

> **Boundary / responsibility.** This guide and the codebase are provided to your team.
> Deploying to your infrastructure, and the security review and Risk/Compliance sign-off
> required before the system holds live appraisal data, are Page Group's to carry out.

---

## Option A — Docker (recommended)

1. **Install Docker** (Docker Engine + compose plugin) on the VPS.
2. **Copy the project** to the server (git or scp) into e.g. `/opt/pg-appraisal`.
3. **DNS:** point `appraisal.yourdomain` at the VPS; set that hostname in
   `nginx/appraisal.conf` (replace `appraisal.pagegroup.example`).
4. **TLS certificate** (Let's Encrypt). Simplest one-time issue with a temporary standalone certbot:
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --standalone -d appraisal.yourdomain
   # certs land in /etc/letsencrypt/live/appraisal.yourdomain/
   sudo cp -rL /etc/letsencrypt ./nginx/certs
   ```
   (For production, run certbot on a schedule and mount `/etc/letsencrypt` read-only.)
5. **Build & start:**
   ```bash
   docker compose build
   docker compose run --rm app npm run seed     # first run only: loads roster, opens a cycle
   docker compose up -d
   ```
6. **Retrieve the code sheet** (to distribute access codes privately):
   ```bash
   docker compose run --rm app cat /app/data/CODESHEET.txt
   ```
7. Visit `https://appraisal.yourdomain`. Sign in as Human Capital, then use the **Org data**
   and **Cycle** tabs to manage the roster and open/close the window.

The SQLite database and code sheet live on the `appdata` Docker volume and persist across restarts.

---

## Option B — Node + pm2 (no Docker)

```bash
sudo apt-get install -y nodejs npm build-essential python3   # Node 18+; build tools for better-sqlite3
cd /opt/pg-appraisal
npm ci
npm run build
cp .env.example .env         # edit: NODE_ENV=production, PORT=8080, DB_PATH=/opt/pg-appraisal/data/appraisal.db
npm run seed
sudo npm i -g pm2
pm2 start server/server.js --name pg-appraisal
pm2 save && pm2 startup
```
Then install nginx on the host and use `nginx/appraisal.conf` (adjust `proxy_pass` to
`http://127.0.0.1:8080`), and issue TLS with `certbot --nginx -d appraisal.yourdomain`.

---

## Security hardening checklist (before live data)

- [ ] **HTTPS only** — TLS terminated at nginx; HTTP redirects to HTTPS (config does this). Cookies are `secure` when `NODE_ENV=production`.
- [ ] **Secrets in env, not code** — no credentials committed; `.env` and `data/CODESHEET.txt` are git-ignored.
- [ ] **Move to email-OTP or SSO** for authentication (stronger than static codes). Static codes are acceptable only for a controlled launch.
- [ ] **Rotate / distribute access codes privately**; delete the code sheet from the server after distribution.
- [ ] **Firewall** — expose only 80/443; block direct access to the app port.
- [ ] **Tighten CSP** in nginx once asset origins are confirmed (currently permissive).
- [ ] **Backups** — snapshot the `data/` volume regularly (see below); test a restore.
- [ ] **Least privilege** — run the container/process as a non-root user; restrict DB file permissions.
- [ ] **DPIA & Risk/Compliance sign-off** — complete before the first live cycle (NDPA).
- [ ] **Audit review** — the `audit` table logs access and changes; confirm retention meets policy.
- [ ] **Patching** — keep the base image / Node and dependencies updated.

## Backups

The entire state is the SQLite database. Back it up consistently (WAL-safe) with:
```bash
# Docker
docker compose exec app sh -c "sqlite3 /app/data/appraisal.db \".backup '/app/data/backup-$(date +%F).db'\""
# then copy the backup off-box (scp / object storage)
```
Or simply snapshot the `appdata` volume when the app is briefly stopped.

## Email delivery (implemented — optional, config-gated)

The system can email login codes. It is **off by default** and falls back to the printed
code sheet until you set SMTP credentials in `.env`:

```
APP_URL=https://appraisal.yourdomain
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Page Group Performance <no-reply@pagegroup.com>
```

With SMTP set, three things become active:
- **"Email me a sign-in code"** on the login screen — sends a one-time code (10-minute, single-use) to the entered work email. Login accepts either the standing access code *or* a valid one-time code. The destination is the address held on the employee record, never typed at sign-in.
- **Apply** emails each newly issued access code to its recipient.
- **Reissue code** (Employees tab) emails the new code to that person.

`GET /api/config` reports `{ emailEnabled }` so the UI shows the right guidance. This is a
lighter-weight stand-in for full corporate SSO, which remains the strongest option; the login
flow is the single place SSO would later plug in.
