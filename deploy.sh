#!/usr/bin/env bash
# Deploy script for the Zinto VPS (Netcup RS 1000 G12).
# Run this ON THE SERVER as the `deploy` user, from /home/deploy/zinto:
#   ./deploy.sh
#
# What it does: pulls the target branch, installs deps, builds, restarts
# the pm2-managed process. Stops on the first failure (set -e) so a broken
# build never gets restarted into production.

set -euo pipefail

BRANCH="${1:-main}"
APP_NAME="zinto"

echo "==> Deploying branch: $BRANCH"

echo "==> Fetching latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Running database migrations"
npm run db:migrate

echo "==> Building production bundle"
npm run build

echo "==> Restarting application"
pm2 restart "$APP_NAME" --update-env

echo "==> Deploy complete. Recent logs:"
pm2 logs "$APP_NAME" --lines 20 --nostream
