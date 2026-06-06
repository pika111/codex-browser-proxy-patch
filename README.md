# Codex Browser Proxy Patch

A small macOS utility that patches Codex Desktop's bundled Browser and Chrome automation clients so non-local requests can go through a local HTTP proxy.

It is designed for cases where the app or page can use a proxy, but Codex's automation control layer does not inherit proxy environment variables.

## Platform Support

- macOS: supported by the installer in this repository.
- Windows/Linux: not currently supported by the installer. The patcher is a Node.js script, but the auto-run setup in this repository uses macOS LaunchAgent.

## What It Changes

The patcher edits Codex Desktop's bundled Browser and Chrome automation client files under `$HOME/.codex`.

For non-local HTTP/HTTPS requests, it routes the automation control layer through:

```txt
http://127.0.0.1:7897
```

by default.

Local targets bypass the proxy:

- `localhost`
- `127.0.0.1`
- `::1`
- `.local` hosts

The patch is idempotent, so it can be run repeatedly. If Codex refreshes or replaces the bundled plugin files, the LaunchAgent runs it again.

## Requirements

- macOS
- Codex Desktop installed
- A local HTTP proxy, such as Clash, listening on a local port
- Node.js

The installer first tries Codex Desktop's bundled Node.js:

```txt
/Applications/Codex.app/Contents/Resources/node
```

If that is not available, it falls back to `node` from your shell `PATH`.

## Quick Install

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

## Choose the Proxy Port

Use the local HTTP proxy port from your proxy client.

Common examples:

```sh
CODEX_BROWSER_PROXY_PORT=7897 ./scripts/install-launchagent.sh
CODEX_BROWSER_PROXY_PORT=7890 ./scripts/install-launchagent.sh
```

If your proxy is not on `127.0.0.1`, set the host too:

```sh
CODEX_BROWSER_PROXY_HOST=127.0.0.1 \
CODEX_BROWSER_PROXY_PORT=7897 \
./scripts/install-launchagent.sh
```

## Configuration

Environment variables:

```sh
CODEX_HOME="$HOME/.codex"
CODEX_BROWSER_PROXY_HOST="127.0.0.1"
CODEX_BROWSER_PROXY_PORT="7897"
CODEX_BROWSER_PROXY_PATCH_LABEL="com.example.codex-browser-proxy-patch"
CODEX_NODE="/Applications/Codex.app/Contents/Resources/node"
```

Only `CODEX_BROWSER_PROXY_PORT` is usually needed.

## Verify Installation

Check that the LaunchAgent is loaded:

```sh
launchctl print "gui/$(id -u)/com.example.codex-browser-proxy-patch"
```

Check the latest patch output:

```sh
tail -n 20 "$HOME/.codex/logs/codex-browser-proxy-patch.out.log"
tail -n 20 "$HOME/.codex/logs/codex-browser-proxy-patch.err.log"
```

Expected output contains lines like:

```txt
ok .../browser-client.mjs
patched=0 proxy=http://127.0.0.1:7897
```

`patched=0` is normal after the files are already patched. `patched=1` or higher means files were changed during that run.

## Reinstall or Change Port

Run the installer again with the new port:

```sh
CODEX_BROWSER_PROXY_PORT=7890 ./scripts/install-launchagent.sh
```

The installer overwrites the previous LaunchAgent plist and restarts the job.

## Manual Run

You can run the patch once without installing the LaunchAgent:

```sh
CODEX_BROWSER_PROXY_PORT=7897 node ./scripts/codex-browser-proxy-patch.mjs
```

This is useful for testing, but it will not automatically re-apply after Codex refreshes its bundled plugin files.

## Uninstall

```sh
./scripts/uninstall-launchagent.sh
```

This removes the LaunchAgent. It does not remove files that were already patched inside `$HOME/.codex`; Codex can replace those files when it refreshes or reinstalls bundled plugins.

## Troubleshooting

### The installer cannot find Node.js

Set `CODEX_NODE` manually:

```sh
CODEX_NODE="/path/to/node" ./scripts/install-launchagent.sh
```

### The proxy port is wrong

Re-run the installer with the correct port:

```sh
CODEX_BROWSER_PROXY_PORT=7897 ./scripts/install-launchagent.sh
```

### Codex updates and Browser control times out again

Run the installer once more:

```sh
CODEX_BROWSER_PROXY_PORT=7897 ./scripts/install-launchagent.sh
```

Then check the LaunchAgent log:

```sh
tail -n 50 "$HOME/.codex/logs/codex-browser-proxy-patch.out.log"
tail -n 50 "$HOME/.codex/logs/codex-browser-proxy-patch.err.log"
```

### The patcher reports that patterns did not match

Codex may have changed the bundled Browser or Chrome client format. In that case, the patcher stops instead of editing unknown code.

Open an issue with:

- Codex Desktop version
- Browser or Chrome plugin version
- the patcher error message

Do not include local logs that contain private paths, browser state, tokens, or other sensitive information.

## Privacy

This repository is only the tool. Avoid publishing local logs, screenshots, personal paths, proxy credentials, API keys, browser state, or other sensitive information when reporting issues.
