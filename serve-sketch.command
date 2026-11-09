#!/bin/bash
# Serve the student sketch on every interface.
# GitHub Pages is HTTPS and will block the plain ws:// socket on port 9001,
# so this page stays on the classroom HTTP server.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8080}"

if command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  PY=python
fi

echo "Serving the MQTT Production line sketch on 0.0.0.0:${PORT}"
echo "Students open http://<this-mac-lan-address>:${PORT}/"
echo "Use the Mac LAN address, not localhost."
echo "The sketch connects to that same host on WebSocket port 9001 with SSL off."
if command -v ipconfig >/dev/null 2>&1; then
  LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [ -n "${LAN}" ]; then
    echo "LAN address hint: http://${LAN}:${PORT}/"
  fi
fi

exec "$PY" -m http.server "$PORT" --bind 0.0.0.0
