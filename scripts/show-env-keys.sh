#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Show non-secret values; mask anything containing PASSWORD.
grep -E '^(POSTGRES_|SPRING_DATASOURCE_|REDIS_)' .env | tr -d '\r' | while IFS='=' read -r k v; do
  case "$k" in
    *PASSWORD*) echo "$k=<masked>" ;;
    *) echo "$k=$v" ;;
  esac
done
