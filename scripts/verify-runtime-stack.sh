#!/usr/bin/env sh
set -eu

NGINX_PORT="${NGINX_PORT:-8088}"
BASE_URL="http://nginx"
PUBLIC_URL="http://localhost:${NGINX_PORT}"
LOAD_USERS="${LOAD_USERS:-20}"

docker compose down -v
NGINX_PORT="$NGINX_PORT" docker compose build api web
NGINX_PORT="$NGINX_PORT" docker compose up -d postgres redis api web nginx

i=0
while [ "$i" -lt 90 ]; do
  if curl -fsS "${PUBLIC_URL}/api/health" >/dev/null && curl -fsS "${PUBLIC_URL}/" >/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$i" -ge 90 ]; then
  docker compose ps -a
  docker compose logs api --tail=160
  docker compose logs web --tail=120
  docker compose logs nginx --tail=80
  exit 1
fi

docker compose ps
sh scripts/verify-seed.sh
docker run --rm --network ticket-box_default -v "$(pwd):/workspace" -w /workspace \
  -e BASE_URL="$BASE_URL" \
  -e AI_BIO_SMOKE="${AI_BIO_SMOKE:-false}" \
  -e AI_BIO_PRESS_KIT="${AI_BIO_PRESS_KIT:-import-samples/artist-press-kit-sample.pdf}" \
  -e AI_BIO_SMOKE_TIMEOUT_MS="${AI_BIO_SMOKE_TIMEOUT_MS:-90000}" \
  node:22-alpine node scripts/final-smoke.mjs
docker run --rm --network ticket-box_default -v "$(pwd):/workspace" -w /workspace -e BASE_URL="$BASE_URL" -e LOAD_USERS="$LOAD_USERS" node:22-alpine node scripts/load-purchase-queue.mjs

echo "OK runtime stack verified through ${PUBLIC_URL}"
