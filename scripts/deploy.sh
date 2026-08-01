#!/usr/bin/env bash
# Docker-only deploy for EMS on EC2.
# Host Nginx (/etc/nginx/conf.d/ems.conf) is the reverse proxy — unchanged.
# Called by GitHub Actions over SSH (or run manually).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="${DEPLOY_BRANCH:-master}"

echo "==> Deploying EMS (Docker only) from $(pwd) (branch: ${BRANCH})"

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env is missing. Create it on the server first."
  exit 1
fi

if [[ ! -f .env.docker ]]; then
  echo "ERROR: .env.docker is missing."
  echo "  cp .env.docker.example .env.docker"
  echo "  Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL to your server IP/domain"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin is missing."
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "ERROR: docker buildx is missing (compose build needs buildx >= 0.17)."
  echo "Install with:"
  echo "  sudo mkdir -p /usr/local/lib/docker/cli-plugins"
  echo "  sudo curl -SL https://github.com/docker/buildx/releases/download/v0.23.0/buildx-v0.23.0.linux-amd64 \\"
  echo "    -o /usr/local/lib/docker/cli-plugins/docker-buildx"
  echo "  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx"
  echo "  docker buildx version"
  exit 1
fi

echo "==> Pulling latest code"
# Private HTTPS repo: username + PAT as password (set GH_PAT to avoid prompts).
if [[ -n "${GH_PAT:-}" ]]; then
  USERNAME="${GH_USERNAME:-git}"
  git -c "credential.helper=!f() { echo username=${USERNAME}; echo password=${GH_PAT}; }; f" \
    pull --ff-only origin "${BRANCH}"
else
  git pull --ff-only origin "${BRANCH}"
fi

# Free ports 3000/4000 if an old host-PM2 setup is still running.
if command -v pm2 >/dev/null 2>&1; then
  echo "==> Stopping host PM2 apps (Docker owns 3000/4000 now)"
  pm2 stop ems-backend ems-frontend >/dev/null 2>&1 || true
  pm2 delete ems-backend ems-frontend >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
fi

echo "==> Removing old EMS containers (avoid name conflicts)"
docker compose --env-file .env.docker down --remove-orphans >/dev/null 2>&1 || true
# Also drop any leftover containers that reuse ems-* names from failed deploys
docker rm -f ems-backend ems-frontend >/dev/null 2>&1 || true
docker ps -aq --filter "name=ems-frontend" | xargs -r docker rm -f >/dev/null 2>&1 || true
docker ps -aq --filter "name=ems-backend" | xargs -r docker rm -f >/dev/null 2>&1 || true

echo "==> Building and starting containers"
docker compose --env-file .env.docker up -d --build --remove-orphans --force-recreate

echo "==> Pruning unused images"
docker image prune -f

echo "==> Reloading host nginx (ems.conf)"
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "==> Status"
docker compose ps

echo "==> Deploy finished"
echo "    Logs: docker compose logs -f --tail=80"
