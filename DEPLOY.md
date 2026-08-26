# PageOS — Deployment Guide

**VPS:** `187.124.112.25`  
**URL:** `https://app.pageos.org`  
**Path on VPS:** `/opt/pageos/`  
**Pattern:** Same as imole-v2 and anike on this VPS — host nginx + certbot, Docker services on localhost ports.

---

## Step 1 — Add DNS record for `app.pageos.org`

In your domain registrar for `pageos.org`, add:

```
Type  Name   Value
A     app    187.124.112.25
```

DNS propagates in minutes to a few hours. You can continue with the next steps while waiting — you only need it for Step 6 (SSL).

---

## Step 2 — SSH into the VPS

```bash
ssh root@187.124.112.25
```

All remaining server-side steps run here unless noted.

---

## Step 3 — Create the `/opt/pageos/` directory and `.env`

```bash
mkdir -p /opt/pageos
```

Create the `.env` file (use strong passwords — same importance as imole/anike):

```bash
cat > /opt/pageos/.env << 'EOF'
# Database
POSTGRES_USER=pageos
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=pageos

# Object storage (MinIO)
MINIO_ROOT_USER=pageos
MINIO_ROOT_PASSWORD=$(openssl rand -hex 20)
S3_BUCKET=pageos-docs

# Public URL
NEXT_PUBLIC_API_URL=https://app.pageos.org

# Email (leave blank to disable — notifications won't send)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@pageos.org
EOF
chmod 600 /opt/pageos/.env
```

> **Important:** Replace the `$(openssl rand ...)` values with actual passwords — bash doesn't auto-expand them when using `<< 'EOF'` (single-quoted heredoc). Run the `openssl rand` commands first and paste the output.

```bash
# Generate the passwords separately first:
openssl rand -hex 16   # paste as POSTGRES_PASSWORD
openssl rand -hex 20   # paste as MINIO_ROOT_PASSWORD
```

---

## Step 4 — Copy the code to the VPS

**Option A — From your local machine (first time):**

```bash
# On your local machine:
rsync -az --exclude '.git' --exclude '.env' \
  --exclude 'node_modules' --exclude '.next' \
  /Users/nonsookoroafor/pageOS/ root@187.124.112.25:/opt/pageos/
```

**Option B — From GitHub (after you push):**

```bash
# On the VPS:
# (requires the repo to be public or a deploy key set up)
git clone https://github.com/YOUR_ORG/pageOS.git /opt/pageos
```

---

## Step 5 — Build and start services

```bash
cd /opt/pageos
docker compose -f docker-compose.prod.yml up -d --build
```

This starts:
- `pageos-postgres-1` — PostgreSQL (internal only)
- `pageos-minio-1` — MinIO object store (internal only)
- `pageos-api-1` — Go API on `127.0.0.1:8090`
- `pageos-web-1` — Next.js on `127.0.0.1:3090`

Migrations run automatically on API startup (goose embedded).

Check everything is running:

```bash
docker compose -f docker-compose.prod.yml ps
# All four should show "Up" or "running"

# Quick API check (before nginx):
curl http://127.0.0.1:8090/api/v1/healthz
# Expected: {"status":"ok","db":"ok"}
```

---

## Step 6 — Configure host nginx

Copy the site config:

```bash
cp /opt/pageos/nginx/app.pageos.org /etc/nginx/sites-available/app.pageos.org
ln -sf /etc/nginx/sites-available/app.pageos.org /etc/nginx/sites-enabled/app.pageos.org
nginx -t   # must print "syntax is ok"
nginx -s reload
```

> If nginx isn't installed: `apt install nginx -y`

---

## Step 7 — Issue SSL certificate

First confirm DNS has propagated:
```bash
dig +short app.pageos.org
# Must return 187.124.112.25
```

Then issue the cert:
```bash
certbot --nginx -d app.pageos.org
# Follow prompts: agree to ToS, choose option 2 (redirect HTTP → HTTPS)
```

Certbot fills in the SSL certificate paths in the nginx config automatically and sets up auto-renewal.

Verify:
```bash
curl -fsS https://app.pageos.org/api/v1/healthz
# Expected: {"status":"ok","db":"ok"}
```

**PageOS is now live at https://app.pageos.org** ✓

---

## Step 8 — Create the admin user

```bash
cd /opt/pageos
docker compose -f docker-compose.prod.yml exec api /api \
  # The API seeds admin@pagegroup.ng / changeme123 on first startup.
  # Log in and change the password immediately.
```

The bootstrap seed (in `cmd/api/main.go`) creates:
- `admin@pagegroup.ng` / `changeme123` — super admin
- `hr@pagegroup.ng` / `changeme123` — HR manager

**Change both passwords on first login.**

---

## Step 9 — Set up GitHub Actions for automatic deploys

The `.github/workflows/deploy.yml` already exists in the repo. Add three secrets to the GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.124.112.25` |
| `VPS_SSH_KEY` | Contents of the SSH private key that has root access to the VPS |
| `VPS_KNOWN_HOSTS` | Run `ssh-keyscan 187.124.112.25` and paste the output |

Once set, every push to `main` deploys automatically. To deploy manually:
```bash
gh workflow run deploy.yml
```

---

## Port map (for reference)

| Service | Host port | Internal port |
|---|---|---|
| PageOS API | 127.0.0.1:**8090** | 8080 |
| PageOS Web | 127.0.0.1:**3090** | 3000 |
| PostgreSQL | internal only | 5432 |
| MinIO | internal only | 9000/9001 |

These don't clash with imole (8001/8002) or anike (8082/8083/3082).

---

## Routine operations

**View live logs:**
```bash
cd /opt/pageos
docker compose -f docker-compose.prod.yml logs -f
```

**Restart a single service:**
```bash
docker compose -f docker-compose.prod.yml restart api
```

**Manual redeploy without GitHub Actions:**
```bash
# On VPS:
cd /opt/pageos && git pull && \
  docker compose -f docker-compose.prod.yml up -d --build
```

**Backup the database:**
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U pageos pageos > /tmp/pageos_backup_$(date +%Y%m%d).sql
```
