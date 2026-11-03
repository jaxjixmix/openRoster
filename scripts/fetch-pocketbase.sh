#!/usr/bin/env bash
set -euo pipefail

VERSION="${PB_VERSION:-0.40.6}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${OS}_${ARCH}.zip"

echo "Downloading PocketBase ${VERSION} (${OS}/${ARCH})..."
curl -fsSL "$URL" -o "$TMP/pb.zip"
unzip -o "$TMP/pb.zip" -d "$TMP" >/dev/null
install -m 755 "$TMP/pocketbase" "$ROOT/pb/pocketbase"
rm -rf "$TMP"
echo "Installed pb/pocketbase"
