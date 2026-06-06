# Codex Browser Proxy Patch

A small macOS utility that patches Codex Desktop's bundled Browser and Chrome automation clients so non-local requests can go through a local HTTP proxy.

It is designed for cases where the app or page can use a proxy, but Codex's automation control layer does not inherit proxy environment variables.

## Install

```sh
git clone https://github.com/pika111/codex-browser-proxy-patch.git
cd codex-browser-proxy-patch
CODEX_BROWSER_PROXY_PORT=7897 ./scripts/install-launchagent.sh
```

The installer:

- copies the patcher to `$HOME/.codex/scripts`
- creates a user LaunchAgent under `$HOME/Library/LaunchAgents`
- runs the patch once immediately
- re-runs it when Codex's bundled plugin files are refreshed

## Configure

Environment variables:

```sh
CODEX_HOME="$HOME/.codex"
CODEX_BROWSER_PROXY_HOST="127.0.0.1"
CODEX_BROWSER_PROXY_PORT="7897"
CODEX_BROWSER_PROXY_PATCH_LABEL="com.example.codex-browser-proxy-patch"
CODEX_NODE="/Applications/Codex.app/Contents/Resources/node"
```

Only `CODEX_BROWSER_PROXY_PORT` is usually needed.

## Manual Run

```sh
CODEX_BROWSER_PROXY_PORT=7897 node ./scripts/codex-browser-proxy-patch.mjs
```

## Uninstall

```sh
./scripts/uninstall-launchagent.sh
```

## Notes

- Local hosts such as `localhost`, `127.0.0.1`, `::1`, and `.local` bypass the proxy.
- The patch is idempotent and can be run repeatedly.
- If Codex changes the bundled client format, the patcher fails instead of editing unknown code.
