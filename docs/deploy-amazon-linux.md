# Deploy EMS on Amazon Linux (EC2) with Git

Step-by-step guide to host this Examination Management System on an **Amazon Linux 2023** EC2 instance using Git.

## What you will run on the server

| Service | Folder | Port (internal) | Process manager |
|---------|--------|-----------------|-----------------|
| Backend API | `backend/` | `4000` | PM2 |
| Frontend (Next.js) | `frontend/` | `3000` | PM2 |
| Reverse proxy | Nginx | `80` / `443` | systemd |

Databases stay **off** this EC2 box (RDS MySQL + Fee Management / HRMS Mongo — already configured in `.env`).

---

## 0) Before you start (AWS console)

1. EC2 instance: **Amazon Linux 2023**
2. Security Group inbound rules:
   - **22** (SSH) — your IP only
   - **80** (HTTP) — `0.0.0.0/0` (or CloudFront later)
   - **443** (HTTPS) — when you add SSL
   - Do **not** open `3000` / `4000` publicly if Nginx will proxy
3. Elastic IP (recommended) so the public IP does not change
4. RDS / Mongo security groups allow this EC2 security group (or its private IP) on MySQL `3306` / Mongo ports

Note your:
- EC2 public IP or Elastic IP → call it `YOUR_SERVER_IP`
- SSH key path on your PC → e.g. `ems-key.pem`
- Git repo URL (HTTPS or SSH)

---

## 1) SSH into the instance

From your Windows PC (PowerShell / Git Bash):

```bash
ssh -i /path/to/ems-key.pem ec2-user@YOUR_SERVER_IP
```

Amazon Linux default user is **`ec2-user`**.

First login tip: if the key is rejected on Windows, fix permissions:

```bash
icacls ems-key.pem /inheritance:r
icacls ems-key.pem /grant:r "%USERNAME%:R"
```

---

## 2) Update the OS and install base tools

```bash
sudo dnf update -y
sudo dnf install -y git nginx
```

---

## 3) Install Node.js 20 (LTS)

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

You want Node **v20.x** (or newer LTS).

Install PM2 globally:

```bash
sudo npm install -g pm2
```

---

## 4) Create app directory and clone Git

```bash
sudo mkdir -p /var/www
sudo chown ec2-user:ec2-user /var/www
cd /var/www
```

### Option A — HTTPS clone (simple)

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git ems
cd ems
```

If the repo is private, GitHub will ask for credentials, or use a Personal Access Token as the password.

### Option B — SSH clone (better for ongoing deploys)

On the server:

```bash
ssh-keygen -t ed25519 -C "ems-ec2" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add that public key as a **GitHub Deploy Key** (repo → Settings → Deploy keys → Allow read-only).

Then:

```bash
git clone git@github.com:YOUR_ORG/YOUR_REPO.git ems
cd ems
```

---

## 5) Create production env files

### Backend

```bash
cd /var/www/ems/backend
nano .env
```

Use your production values. Important fields:

```env
NODE_ENV=production
PORT=4000
API_PREFIX=api
CORS_ORIGIN=http://YOUR_SERVER_IP
# later with domain:
# CORS_ORIGIN=https://ems.yourcollege.edu

JWT_SECRET=PUT_A_LONG_RANDOM_SECRET_HERE
JWT_EXPIRES_IN=1d

HRMS_MONGODB_URI=...
FEE_MANAGEMENT_MONGODB_URI=...
FEE_MANAGEMENT_EXAM_FEE_HEAD_CODE=EXM01

EXAM_PORTAL_DB_HOST=...
EXAM_PORTAL_DB_PORT=3306
EXAM_PORTAL_DB_NAME=examination_portal
EXAM_PORTAL_DB_USER=...
EXAM_PORTAL_DB_PASSWORD=...
EXAM_PORTAL_DB_SSL=true
EXAM_PORTAL_DB_SYNCHRONIZE=true
MYSQL_SSL_REJECT_UNAUTHORIZED=false

STUDENT_DB_HOST=...
STUDENT_DB_PORT=3306
STUDENT_DB_NAME=student_database
STUDENT_DB_USER=...
STUDENT_DB_PASSWORD=...
STUDENT_DB_SSL=true
```

`CORS_ORIGIN` must match the URL users open in the browser (IP now, domain later).

### Frontend

```bash
cd /var/www/ems/frontend
nano .env.production
```

```env
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP/api
NEXT_PUBLIC_APP_URL=http://YOUR_SERVER_IP
```

With a domain + HTTPS later:

```env
NEXT_PUBLIC_API_URL=https://ems.yourcollege.edu/api
NEXT_PUBLIC_APP_URL=https://ems.yourcollege.edu
```

`NEXT_PUBLIC_*` values are baked in at **build** time, so rebuild after changing them.

---

## 6) Install dependencies and build

### Backend

```bash
cd /var/www/ems/backend
npm ci
# or: npm install
```

Optional — create exam portal DB if it does not exist yet:

```bash
npm run db:setup
```

Optional — clear exam portal data only (never touches student DB / fee mgmt):

```bash
# dry-run first
node scripts/clear-exam-portal-data.js

# real wipe (only when you intend to)
node scripts/clear-exam-portal-data.js --execute --i-understand-exam-portal-only
```

### Frontend

```bash
cd /var/www/ems/frontend
npm ci
npm run build
```

---

## 7) Start apps with PM2

From the repo root (`/home/ec2-user/ems` or `/var/www/ems`):

```bash
cd /home/ec2-user/ems

# first time
pm2 start ecosystem.config.js

# after code updates
pm2 reload ecosystem.config.js

pm2 save
pm2 startup
# run the sudo command PM2 prints

pm2 status
```

`ecosystem.config.js` starts both:

| App | Port | Script |
|-----|------|--------|
| `ems-backend` | 4000 | `backend/src/index.js` |
| `ems-frontend` | 3000 | Next.js `next start -p 3000` |

If your clone path is different (e.g. `/var/www/ems`), edit the `cwd` values in `ecosystem.config.js` first.

Useful checks:

```bash
pm2 logs ems-backend --lines 50
pm2 logs ems-frontend --lines 50
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/api/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
```

---

## 8) Configure Nginx reverse proxy

```bash
sudo nano /etc/nginx/conf.d/ems.conf
```

Paste (replace nothing if using IP for now):

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 30M;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and start Nginx:

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

Open in browser:

```text
http://YOUR_SERVER_IP
```

API should be:

```text
http://YOUR_SERVER_IP/api/...
```

---

## 9) Day-to-day update from Git

Whenever you push new code:

```bash
cd /var/www/ems
git pull

cd backend
npm ci
pm2 restart ems-backend

cd ../frontend
npm ci
npm run build
pm2 restart ems-frontend
```

If env vars changed for frontend, edit `.env.production` **before** `npm run build`.

---

## 10) HTTPS (when you have a domain)

1. Point DNS `A` record → Elastic IP
2. Update:
   - `backend/.env` → `CORS_ORIGIN=https://your-domain`
   - `frontend/.env.production` → `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL`
3. Rebuild frontend + restart PM2
4. Install certbot (Amazon Linux method may vary; common path):

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain
```

Update Nginx `server_name` to your domain before certbot if needed.

---

## 11) Quick troubleshooting

| Problem | Check |
|---------|--------|
| Site not loading | Security group port 80, `sudo systemctl status nginx` |
| API CORS errors | `CORS_ORIGIN` must match browser URL exactly |
| Frontend calls localhost | Rebuild after fixing `NEXT_PUBLIC_API_URL` |
| DB connection failed | RDS SG allows EC2 SG; SSL flags in `.env` |
| Fee due / login issues | Fee Mgmt / HRMS Mongo URIs reachable from EC2 |
| App died after reboot | `pm2 startup` + `pm2 save` |

```bash
pm2 status
pm2 logs
sudo journalctl -u nginx -n 50 --no-pager
```

---

## Recommended production checklist

- [ ] Elastic IP attached
- [ ] SSH restricted to your IP
- [ ] Ports 3000/4000 not public
- [ ] Strong `JWT_SECRET`
- [ ] Production `.env` files on server (never commit secrets)
- [ ] `pm2 save` + startup configured
- [ ] Nginx serving `/` → frontend, `/api` → backend
- [ ] Dry-run DB clear script before any wipe
- [ ] Domain + HTTPS when ready

---

## Architecture (simple)

```text
Browser
  │
  ▼
Nginx :80/:443
  ├─ /api/*  →  PM2 ems-backend :4000  →  RDS exam portal + student DB + Mongo
  └─ /*      →  PM2 ems-frontend :3000
```

That is enough to go live on Amazon Linux with Git.
