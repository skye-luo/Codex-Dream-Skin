#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
START_AGENT="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-start) START_AGENT="false"; shift ;;
    *) fail "Unknown autostart installer argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

ensure_state_root
discover_codex_app
require_signed_node_runtime
WATCHER="$SCRIPT_DIR/autostart-dream-skin-macos.sh"
[ -f "$WATCHER" ] || fail "Autostart watcher is missing: $WATCHER"

if [ -e "$AUTOSTART_PLIST_PATH" ]; then
  existing_label="$(/usr/bin/plutil -extract Label raw -o - "$AUTOSTART_PLIST_PATH" 2>/dev/null || true)"
  [ "$existing_label" = "$AUTOSTART_JOB_LABEL" ] \
    || fail "Refusing to replace an unrelated LaunchAgent: $AUTOSTART_PLIST_PATH"
fi

AUTOSTART_TMP="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/dream-skin-autostart.XXXXXX")"
cleanup_autostart_tmp() { /bin/rm -f "$AUTOSTART_TMP"; }
trap cleanup_autostart_tmp EXIT
"$NODE" "$SCRIPT_DIR/write-autostart-plist.mjs" \
  "$AUTOSTART_TMP" "$AUTOSTART_JOB_LABEL" "$WATCHER" "$PORT" \
  "$AUTOSTART_LOG" "$AUTOSTART_ERROR_LOG"
/usr/bin/plutil -lint "$AUTOSTART_TMP" >/dev/null

# Reinstalling an identical, already-running KeepAlive agent can fail when the
# caller itself was launched by that agent. The job executes scripts by path,
# so code updates do not require recycling an unchanged launchd definition.
if [ -f "$AUTOSTART_PLIST_PATH" ] \
  && /usr/bin/cmp -s "$AUTOSTART_TMP" "$AUTOSTART_PLIST_PATH" \
  && /bin/launchctl print "gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL" >/dev/null 2>&1; then
  printf 'Dream Skin restart recovery is already installed on loopback port %s.\n' "$PORT"
  exit 0
fi

/bin/launchctl bootout "gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL" >/dev/null 2>&1 || true
/bin/mv "$AUTOSTART_TMP" "$AUTOSTART_PLIST_PATH"
AUTOSTART_TMP=""
/usr/bin/plutil -lint "$AUTOSTART_PLIST_PATH" >/dev/null

if [ "$START_AGENT" = "true" ]; then
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$AUTOSTART_PLIST_PATH"
  /bin/launchctl kickstart "gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL" >/dev/null
fi

printf 'Dream Skin restart recovery installed on loopback port %s.\n' "$PORT"
