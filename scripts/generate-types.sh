#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${PB_URL:-http://127.0.0.1:8097}"
EMAIL="${PB_SUPERUSER:-admin@openroster.local}"

if [ -z "${PB_SUPERUSER_PASSWORD:-}" ]; then
  echo "Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password." >&2
  exit 1
fi

cd "$ROOT/web"
npx pocketbase-typegen \
  --url "$URL" \
  --email "$EMAIL" \
  --password "$PB_SUPERUSER_PASSWORD" \
  --out src/lib/pb-generated.ts \
  --no-sdk
echo "Regenerated web/src/lib/pb-generated.ts"
