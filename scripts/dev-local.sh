#!/bin/sh

set -eu

platform="${1:-start}"

case "$platform" in
  start|ios|android) ;;
  *)
    echo "Usage: $0 [start|ios|android]" >&2
    exit 2
    ;;
esac

pnpm build

cleanup() {
  if [ -n "${monitor_pid:-}" ]; then
    kill -TERM "$monitor_pid" 2>/dev/null || true
  fi
  if [ -n "${backend_pid:-}" ]; then
    kill -TERM "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT TERM HUP
trap 'echo "Backend processes stopped; closing Expo." >&2; exit 1' USR1

pnpm exec concurrently -k -n functions,emulators \
  "pnpm --filter @tastes/functions build:watch" \
  "node scripts/run-firebase.mjs emulators:start --project demo-tastes --export-on-exit=.firebase-data" \
  </dev/null &
backend_pid=$!

# Expo needs the foreground TTY, so a small monitor reports backend failures to this shell.
(
  while kill -0 "$backend_pid" 2>/dev/null; do
    sleep 1
  done
  kill -USR1 "$$"
) &
monitor_pid=$!

# Keep Expo in the foreground so it receives a real TTY and handles j/m/r.
pnpm --filter @tastes/mobile "$platform"
