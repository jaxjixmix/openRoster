#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="${1:-}"

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 /path/to/openroster-YYYYMMDD-HHMMSS.tar.gz" >&2
  exit 1
fi

echo "Stop PocketBase before restoring. This will replace pb/pb_data."
read -r -p "Type 'restore' to continue: " answer
[ "$answer" = "restore" ] || exit 1

mv "$ROOT/pb/pb_data" "$ROOT/pb/pb_data.before-restore.$(date +%s)"
tar -xzf "$ARCHIVE" -C "$ROOT/pb"
echo "Restored. Verify migrations with: cd pb && ./pocketbase migrate up --dir=pb_data"
