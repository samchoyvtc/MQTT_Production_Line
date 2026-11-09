#!/bin/bash
# Double-click on the teacher Mac, or run from Terminal.
# macOS will prompt to allow incoming connections on port 9001. Allow them.
# Students use this Mac's LAN address, not localhost.

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v mosquitto >/dev/null 2>&1; then
  echo "Mosquitto is not on PATH. Install it with: brew install mosquitto" >&2
  exit 1
fi

cat <<'EOF'
MQTT Production line broker
  TCP        0.0.0.0:1883
  WebSocket  0.0.0.0:9001
  Anonymous, no username, no password, no TLS

macOS will prompt to allow incoming connections on 9001. Allow them.
Students use this Mac's LAN address, not localhost.
EOF

exec mosquitto -c "$PWD/mosquitto.conf" -v
