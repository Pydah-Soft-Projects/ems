#!/usr/bin/env bash
# Deploy EMS on EC2 with Git + PM2 (ecosystem.config.js).
# Host Nginx (/etc/nginx/conf.d/ems.conf) stays as reverse proxy.
# Called by GitHub Actions over SSH (or run manually on the server).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="${DEPLOY_BRANCH:-master}"

echo "==> Deploying EMS from $(pwd) (branch: ${BRANCH})"

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env is missing. Create it on the server first."
  exit 1
fi

if [[ ! -f ecosystem.config.js ]]; then
  echo "ERROR: ecosystem.config.js is missing."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 is not installed. Run: sudo npm install -g pm2"
  exit 1
fi

echo "==> Fetching latest code"
git fetch origin "${BRANCH}"

# Private HTTPS repo: username + PAT (Personal Access Token) as password.
if [[ -n "${GH_PAT:-}" ]]; then
  USERNAME="${GH_USERNAME:-git}"
  git -c "credential.helper=!f() { echo username=${USERNAME}; echo password=${GH_PAT}; }; f" \
    pull --ff-only origin "${BRANCH}"
else
  git pull --ff-only origin "${BRANCH}"
fi

echo "==> Installing backend deps"
(
  cd backend
  npm ci
)

echo "==> Installing + building frontend"
(
  cd frontend
  npm ci
  # NEXT_PUBLIC_* come from frontend/.env.production on the server
  npm run build
)

echo "==> Reloading apps with PM2 (ecosystem.config.js)"
if pm2 describe ems-backend >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save

echo "==> Reloading host nginx (ems.conf)"
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "==> Current status"
pm2 status

echo "==> Deploy finished"
