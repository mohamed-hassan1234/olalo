#!/usr/bin/env bash
# Build and (re)start everything on the VPS. Run from the repository root as the deploy user:
#   cd /var/www/zakariye && bash deploy/deploy.sh
set -euo pipefail

DOMAIN="${DOMAIN:-https://zakariye.elivateict.com}"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies (skipping the test-only MongoDB binary download)"
MONGOMS_DISABLE_POSTINSTALL=1 npm ci --no-audit --no-fund

echo "==> Building shared package and API"
npm run build -w @lattice/shared
npm run build -w @lattice/api

echo "==> Building public site for $DOMAIN"
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="$DOMAIN" npm run build -w @lattice/web

echo "==> Building admin app (served at /console/)"
ADMIN_BASE=/console/ VITE_API_URL="$DOMAIN" npm run build -w @lattice/admin

echo "==> Restarting API and reloading nginx"
sudo systemctl restart lattice-api
sudo nginx -t && sudo systemctl reload nginx

sleep 2
PORT=$(sudo grep -E "^PORT=" /etc/lattice/api.env | cut -d= -f2)
curl -fsS "http://127.0.0.1:${PORT:-4100}/v1/health" && echo && echo "==> Deployed: $DOMAIN  (admin: $DOMAIN/console/)"
