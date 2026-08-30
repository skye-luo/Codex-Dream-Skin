#!/bin/bash

# Keeps the skin available when the user reopens the official Codex app from
# Dock/Finder. Chromium's loopback debugging endpoint is a launch-time option,
# so a normal app launch must be replaced once with a verified themed launch.

set -u
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
MODE="watch"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --watch) MODE="watch"; shift ;;
    --probe) MODE="probe"; shift ;;
    *) printf 'Unknown autostart argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) printf 'Invalid port: %s\n' "$PORT" >&2; exit 2 ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || exit 2

ensure_state_root
discover_codex_app || exit 1
require_signed_node_runtime || exit 1

probe_action() {
  local session=""
  session="$(state_field session 2>/dev/null || true)"
  [ "$session" != "paused" ] || { printf 'paused\n'; return 0; }
  [ "$session" != "incompatible" ] || { printf 'incompatible\n'; return 0; }
  if ! codex_is_running; then printf 'stopped\n'; return 0; fi
  if verified_cdp_endpoint "$PORT" 2>/dev/null; then printf 'ready\n'; else printf 'needs-restart\n'; fi
}

if [ "$MODE" = "probe" ]; then
  probe_action
  exit 0
fi

last_handled_pid=""
while :; do
  action="$(probe_action)"
  current_pid="$(codex_main_pids 2>/dev/null | /usr/bin/head -n 1)"
  case "$action" in
    stopped|paused|incompatible)
      last_handled_pid=""
      ;;
    ready)
      # Own this helper from the persistent LaunchAgent. A router launched by
      # a short-lived menu/start process can otherwise disappear on shell exit.
      if ! conversation_router_is_running "$PORT"; then
        if ! launch_conversation_router "$PORT" >/dev/null; then
          /bin/sleep 2
          continue
        fi
      fi
      if [ -n "$current_pid" ] && [ "$current_pid" != "$last_handled_pid" ]; then
        last_handled_pid="$current_pid"
        recorded_pid="$(state_field codexPid 2>/dev/null || true)"
        session="$(state_field session 2>/dev/null || true)"
        if [ "$session" = "active" ] && [ "$recorded_pid" = "$current_pid" ]; then
          : # The manual start that installed this agent already verified this process.
        elif ! "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --silent --from-autostart; then
          last_handled_pid=""
          /bin/sleep 8
        fi
      fi
      ;;
    needs-restart)
      if [ -n "$current_pid" ] && [ "$current_pid" != "$last_handled_pid" ]; then
        last_handled_pid="$current_pid"
        # Allow the native app launch to settle so a themed launch is not
        # mistaken for an ordinary Dock launch while its endpoint starts.
        /bin/sleep 3
        settled_pid="$(codex_main_pids 2>/dev/null | /usr/bin/head -n 1)"
        if [ "$settled_pid" = "$current_pid" ] && ! verified_cdp_endpoint "$PORT" 2>/dev/null; then
          if ! "$SCRIPT_DIR/start-dream-skin-macos.sh" \
            --port "$PORT" --restart-existing --silent --from-autostart; then
            last_handled_pid=""
            /bin/sleep 8
          else
            last_handled_pid="$(codex_main_pids 2>/dev/null | /usr/bin/head -n 1)"
          fi
        fi
      fi
      ;;
  esac
  /bin/sleep 1
done
