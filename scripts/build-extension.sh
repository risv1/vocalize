#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/extension"
npm run build
echo
echo "Built to extension/dist."
echo "Load it: chrome://extensions -> Developer mode -> Load unpacked -> select extension/dist"
