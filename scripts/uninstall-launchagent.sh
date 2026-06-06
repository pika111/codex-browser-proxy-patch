#!/usr/bin/env bash
set -euo pipefail

LABEL="${CODEX_BROWSER_PROXY_PATCH_LABEL:-com.example.codex-browser-proxy-patch}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ -f "$PLIST" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
fi

echo "Uninstalled $LABEL"
