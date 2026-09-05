#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.overlay.pid"
LOG_FILE="/tmp/stream-overlay.log"
PORT="${STREAM_OVERLAY_PORT:-3333}"

# Stop any already running instance
"$DIR/stop.sh" >/dev/null 2>&1 || true

# Start server in background
nohup node "$DIR/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Wait a brief moment to ensure it started
sleep 0.8
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "OVERLAY_STATUS: RUNNING"
  echo "OVERLAY_PID: $SERVER_PID"
  echo "OVERLAY_URL: http://localhost:$PORT"
  echo "OVERLAY_LOG: $LOG_FILE"
else
  echo "OVERLAY_STATUS: FAILED_TO_START"
  cat "$LOG_FILE" | tail -n 20
  exit 1
fi
