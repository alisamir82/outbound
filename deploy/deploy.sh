#!/usr/bin/env bash
# Run on the VPS from the repo root. Pulls latest, rebuilds images, migrates, restarts.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build web worker
docker compose up -d db redis
docker compose run --rm worker pnpm db:migrate
docker compose up -d
docker compose ps
