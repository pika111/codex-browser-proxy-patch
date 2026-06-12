#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PROXY_HOST="${CODEX_BROWSER_PROXY_HOST:-127.0.0.1}"
PROXY_PORT="${CODEX_BROWSER_PROXY_PORT:-7897}"
LABEL="${CODEX_BROWSER_PROXY_PATCH_LABEL:-com.example.codex-browser-proxy-patch}"

if [[ -n "${CODEX_NODE:-}" ]]; then
  CODEX_NODE_CANDIDATE="$CODEX_NODE"
else
  CODEX_NODE_CANDIDATE=""
  for candidate in \
    "/Applications/Codex.app/Contents/Resources/cua_node/bin/node" \
    "/Applications/Codex.app/Contents/Resources/node"
  do
    if [[ -x "$candidate" ]]; then
      CODEX_NODE_CANDIDATE="$candidate"
      break
    fi
  done
fi

if [[ -z "$CODEX_NODE_CANDIDATE" || ! -x "$CODEX_NODE_CANDIDATE" ]]; then
  CODEX_NODE_CANDIDATE="$(command -v node || true)"
fi

if [[ -z "$CODEX_NODE_CANDIDATE" || ! -x "$CODEX_NODE_CANDIDATE" ]]; then
  CODEX_NODE="$(command -v node || true)"
else
  CODEX_NODE="$CODEX_NODE_CANDIDATE"
fi

if [[ -z "$CODEX_NODE" || ! -x "$CODEX_NODE" ]]; then
  echo "Could not find node. Set CODEX_NODE to a Node.js executable." >&2
  exit 1
fi

SCRIPT_SOURCE="$ROOT_DIR/scripts/codex-browser-proxy-patch.mjs"
SCRIPT_TARGET="$CODEX_HOME/scripts/codex-browser-proxy-patch.mjs"
LOG_DIR="$CODEX_HOME/logs"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$CODEX_HOME/scripts" "$LOG_DIR" "$HOME/Library/LaunchAgents"
install -m 755 "$SCRIPT_SOURCE" "$SCRIPT_TARGET"

xml_escape() {
  printf '%s' "$1" |
    sed \
      -e 's/&/\&amp;/g' \
      -e 's/</\&lt;/g' \
      -e 's/>/\&gt;/g' \
      -e 's/"/\&quot;/g' \
      -e "s/'/\&apos;/g"
}

LABEL_XML="$(xml_escape "$LABEL")"
NODE_XML="$(xml_escape "$CODEX_NODE")"
SCRIPT_XML="$(xml_escape "$SCRIPT_TARGET")"
CODEX_HOME_XML="$(xml_escape "$CODEX_HOME")"
PROXY_HOST_XML="$(xml_escape "$PROXY_HOST")"
PROXY_PORT_XML="$(xml_escape "$PROXY_PORT")"
WATCH_SOURCE_XML="$(xml_escape "$CODEX_HOME/.tmp/bundled-marketplaces/openai-bundled/plugins")"
WATCH_CACHE_XML="$(xml_escape "$CODEX_HOME/plugins/cache/openai-bundled")"
STDOUT_XML="$(xml_escape "$LOG_DIR/codex-browser-proxy-patch.out.log")"
STDERR_XML="$(xml_escape "$LOG_DIR/codex-browser-proxy-patch.err.log")"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL_XML</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_XML</string>
    <string>$SCRIPT_XML</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CODEX_HOME</key>
    <string>$CODEX_HOME_XML</string>
    <key>CODEX_BROWSER_PROXY_HOST</key>
    <string>$PROXY_HOST_XML</string>
    <key>CODEX_BROWSER_PROXY_PORT</key>
    <string>$PROXY_PORT_XML</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>WatchPaths</key>
  <array>
    <string>$WATCH_SOURCE_XML</string>
    <string>$WATCH_CACHE_XML</string>
  </array>
  <key>StandardOutPath</key>
  <string>$STDOUT_XML</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_XML</string>
</dict>
</plist>
EOF

"$CODEX_NODE" "$SCRIPT_TARGET"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed $LABEL"
echo "Proxy: http://$PROXY_HOST:$PROXY_PORT"
echo "Plist: $PLIST"
