#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.overlay.pid"

STOPPED=false

# 1. Try PID file if exists
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 0.3
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    STOPPED=true
  fi
  rm -f "$PID_FILE"
fi

# 2. Kill by process signature just in case
if pgrep -f "node .*/stream-overlay/server.js" >/dev/null 2>&1; then
  pkill -f "node .*/stream-overlay/server.js" 2>/dev/null || true
  STOPPED=true
fi

# Double check if any process still on port 3333
PORT_PIDS=$(lsof -ti :3333 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
  echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
  STOPPED=true
fi

if [ "$STOPPED" = true ]; then
  echo "OVERLAY_STATUS: STOPPED"
else
  echo "OVERLAY_STATUS: ALREADY_STOPPED"
fi
