#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.overlay.pid"
PORT="${STREAM_OVERLAY_PORT:-3333}"

RUNNING=false
PID=""

if [ -f "$PID_FILE" ]; then
  FILE_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$FILE_PID" ] && kill -0 "$FILE_PID" 2>/dev/null; then
    RUNNING=true
    PID="$FILE_PID"
  fi
fi

if [ "$RUNNING" = false ]; then
  PROC_PID=$(pgrep -f "node .*/stream-overlay/server.js" | head -n 1 || true)
  if [ -n "$PROC_PID" ]; then
    RUNNING=true
    PID="$PROC_PID"
  fi
fi

if [ "$RUNNING" = true ]; then
  echo "OVERLAY_STATUS: RUNNING"
  echo "OVERLAY_PID: $PID"
  echo "OVERLAY_URL: http://localhost:$PORT"
else
  echo "OVERLAY_STATUS: STOPPED"
fi
