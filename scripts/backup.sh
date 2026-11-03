#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -d "$ROOT/pb/pb_data" ]; then
  echo "No pb/pb_data directory found. Start PocketBase and seed/setup first." >&2
  exit 1
fi

mkdir -p "$DEST"
tar -czf "$DEST/openroster-$STAMP.tar.gz" -C "$ROOT/pb" pb_data
echo "Backup written to $DEST/openroster-$STAMP.tar.gz"
echo "For a guaranteed-consistent hot backup, use PocketBase's built-in backup dashboard instead."
