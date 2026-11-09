#!/bin/bash
# Start the four ovens. They talk to Mosquitto on TCP 1883.

set -euo pipefail
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  PY=python
fi

if ! "$PY" -c "import paho.mqtt.client" >/dev/null 2>&1; then
  if [ ! -x .venv/bin/python ]; then
    "$PY" -m venv .venv
  fi
  .venv/bin/python -m pip install -r requirements.txt
  exec .venv/bin/python ovens.py
fi

exec "$PY" ovens.py
