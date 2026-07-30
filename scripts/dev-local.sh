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
    wait "$monitor_pid" 2>/dev/null || true
  fi
  if [ -n "${backend_pid:-}" ]; then
    # Firebase CLI tears down its detached Java emulators on SIGINT.
    kill -INT "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
  if [ -n "${firestore_pid:-}" ]; then
    firestore_command="$(ps -p "$firestore_pid" -o command= 2>/dev/null || true)"
    case "$firestore_command" in
      *cloud-firestore-emulator*--project_id\ demo-tastes*)
        kill -TERM "$firestore_pid" 2>/dev/null || true
        ;;
    esac
  fi
}

trap cleanup EXIT
trap 'exit 130' INT TERM HUP
trap 'echo "Backend processes stopped; closing Expo." >&2; exit 1' USR1

import_flag=""
if [ -d .firebase-data ]; then
  import_flag="--import=.firebase-data"
fi

pnpm exec concurrently -k -n functions,emulators \
  "pnpm --filter @tastes/functions build:watch" \
  "node scripts/run-firebase.mjs emulators:start --project demo-tastes $import_flag --export-on-exit=.firebase-data" \
  </dev/null &
backend_pid=$!

# Do not open the app until callable functions are actually accepting requests.
# Otherwise the initial session lookup races the emulator startup and shows a
# misleading `getSessionStatus: internal` development error.
attempts=0
until curl \
  --silent \
  --fail \
  --output /dev/null \
  --header "Content-Type: application/json" \
  --data '{"data":{}}' \
  http://127.0.0.1:5001/demo-tastes/europe-west1/healthCheck
do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid" 2>/dev/null || true
    echo "Firebase emulators stopped before the backend became ready." >&2
    exit 1
  fi

  attempts=$((attempts + 1))
  if [ "$attempts" -ge 60 ]; then
    echo "Firebase functions did not become ready." >&2
    exit 1
  fi
  sleep 1
done

# Firestore's Java process detaches from Firebase CLI on macOS. Keep its exact
# PID so cleanup cannot leave port 8180 occupied for the next local run.
firestore_pid="$(lsof -t -iTCP:8180 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"

# Imported emulator data is not guaranteed to contain the latest demo fixtures.
# Reapply the idempotent seed before the app can read it.
pnpm seed

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
