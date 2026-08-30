#!/bin/bash

set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
ENGINE="${CODEX_DREAM_SKIN_ENGINE:-$HOME/.codex/codex-dream-skin-studio}"
PORT="${CODEX_DREAM_SKIN_PORT:-9341}"
OUTPUT_ROOT="${1:-$ROOT/../verification/live-theme-matrix}"
SCENARIOS="${CODEX_DREAM_SKIN_MATRIX_SCENARIOS:-baseline,profile-menu,quota-menu,help-menu,chat-menu,access-menu}"
TASK_TITLE="${CODEX_DREAM_SKIN_MATRIX_TASK_TITLE:-}"
AUTOSTART_LABEL="com.openai.codex-dream-skin-studio.autostart"
AUTOSTART_PLIST="$HOME/Library/LaunchAgents/$AUTOSTART_LABEL.plist"
GUI_DOMAIN="gui/$(/usr/bin/id -u)"
AUTOSTART_WAS_LOADED="false"
RESTORED="false"

[ -x "$ENGINE/scripts/switch-theme-macos.sh" ] || {
  printf 'Installed Dream Skin engine not found: %s\n' "$ENGINE" >&2
  exit 1
}

# shellcheck source=/dev/null
. "$ENGINE/scripts/common-macos.sh"
discover_codex_app
require_signed_node_runtime

restore_runtime() {
  local code="$?"
  [ "$RESTORED" = "false" ] || return "$code"
  RESTORED="true"
  set +e
  "$ENGINE/scripts/switch-theme-macos.sh" --id mentor-lisa-life --quiet >/dev/null 2>&1
  launch_conversation_router "$PORT" >/dev/null 2>&1
  if [ "$AUTOSTART_WAS_LOADED" = "true" ] && [ -f "$AUTOSTART_PLIST" ]; then
    /bin/launchctl bootstrap "$GUI_DOMAIN" "$AUTOSTART_PLIST" >/dev/null 2>&1 || true
  fi
  return "$code"
}
trap restore_runtime EXIT INT TERM

if /bin/launchctl print "$GUI_DOMAIN/$AUTOSTART_LABEL" >/dev/null 2>&1; then
  AUTOSTART_WAS_LOADED="true"
  /bin/launchctl bootout "$GUI_DOMAIN/$AUTOSTART_LABEL" >/dev/null 2>&1 || true
fi
stop_conversation_router
/bin/mkdir -p "$OUTPUT_ROOT"

for id in mentor-demis-ai mentor-elon-build mentor-duan-invest mentor-lisa-life; do
  name="$($NODE -e 'const t=require(process.argv[1]);process.stdout.write(t.name)' "$ROOT/presets/$id/theme.json")"
  if [ -n "$TASK_TITLE" ]; then
    "$NODE" "$ROOT/tests/cdp-style-probe.mjs" --click-text "$TASK_TITLE" --selector html >/dev/null
  fi
  "$ENGINE/scripts/switch-theme-macos.sh" --id "$id" --quiet
  "$NODE" "$ROOT/tests/live-contrast-audit.mjs" \
    --out "$OUTPUT_ROOT/$id" --expect-theme "$name" --scenarios "$SCENARIOS" \
    --fail-on-contrast --fail-on-skip
done

restore_runtime
trap - EXIT INT TERM
printf 'PASS: all four mentor themes completed the live contrast matrix; Lisa default and automatic routing were restored.\n'
