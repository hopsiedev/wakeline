#!/usr/bin/env bash
set -euo pipefail
mkdir -p packages
openbox > /tmp/wakeline-openbox.log 2>&1 &
wm_pid=$!
target/release/wakeline-app > packages/linux-startup.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" "$wm_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 30); do
  kill -0 "$app_pid" 2>/dev/null || { cat packages/linux-startup.log; exit 1; }
  window=$(xdotool search --onlyvisible --name '^Wakeline$' 2>/dev/null | head -n 1 || true)
  if [ -n "$window" ]; then
    sleep 3
    import -window "$window" packages/linux-startup.png
    exit 0
  fi
  sleep 1
done
cat packages/linux-startup.log
echo 'No visible Wakeline window appeared' >&2
exit 1
