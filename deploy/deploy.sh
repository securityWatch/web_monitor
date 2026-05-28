#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-49.234.112.108}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
APP_DIR="/opt/pulsewatch"

echo "==> Deploying PulseWatch to ${REMOTE_USER}@${REMOTE_HOST}"

ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<'REMOTE'
set -euo pipefail

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

# Install Docker Compose plugin if missing
if ! docker compose version &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-compose-plugin
fi

# Install Nginx if missing
if ! command -v nginx &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq nginx
fi

# Create pulsewatch database if not exists
sudo -u postgres psql -p 6541 -tc "SELECT 1 FROM pg_database WHERE datname='pulsewatch'" | grep -q 1 || \
  sudo -u postgres psql -p 6541 -c "CREATE DATABASE pulsewatch;"

echo "==> Prerequisites ready"
REMOTE

echo "==> Syncing files..."
rsync -avz --exclude node_modules --exclude .next --exclude .git --exclude 环境信息 --exclude .env \
  --exclude '*.exe' \
  ./ "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/"

echo "==> Building and starting services..."
ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<REMOTE
set -euo pipefail
cd ${APP_DIR}

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:prs%402018@127.0.0.1:6541/pulsewatch|' .env
  sed -i 's|JWT_SECRET=.*|JWT_SECRET='"\$(openssl rand -hex 32)"'|' .env
  sed -i 's|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET='"\$(openssl rand -hex 32)"'|' .env
  sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=http://${REMOTE_HOST}|' .env
  sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${REMOTE_HOST}:4000|' .env
fi

docker compose -f deploy/docker-compose.prod.yml --env-file .env build
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d

sudo cp deploy/nginx.conf /etc/nginx/sites-available/pulsewatch
sudo ln -sf /etc/nginx/sites-available/pulsewatch /etc/nginx/sites-enabled/pulsewatch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "==> Deployment complete"
docker compose -f deploy/docker-compose.prod.yml ps
REMOTE

echo "==> Done. Visit http://${REMOTE_HOST}"
