# MQTT Production line

Classroom broker for the final assessment. The teacher Mac runs Mosquitto, four ovens, and this p5.js sketch. Students open the page over HTTP on the classroom Wi-Fi, pick an oven, and watch it.

GitHub Pages is HTTPS, so a page hosted there cannot open the plain `ws://` socket. Serve the sketch from the teacher Mac. Do not put this page on GitHub Pages.

## Teacher Mac

Install Mosquitto (`brew install mosquitto`), then start the three pieces from this folder:

```bash
./start-broker.command
./start-ovens.command
./serve-sketch.command
```

The broker listens on every interface, with no username, no password, and no TLS:

- TCP `1883` for the ovens
- WebSocket `9001` for the sketch (path `/mqtt`)

macOS will prompt to allow incoming connections on 9001. Allow them. Students use the Mac LAN address, not localhost.

`serve-sketch.command` serves the page on `0.0.0.0:8080`. Find the LAN address with `ipconfig getifaddr en0`. A student on the same Wi-Fi opens:

```text
http://<mac-lan-address>:8080/
```

The sketch uses that hostname and connects to WebSocket port 9001 with SSL off. Each browser tab gets its own client id.

## Ovens

`ovens.py` runs ovens 1–4. About once a second, oven `n` publishes JSON on `line/oven/{n}/status`:

```json
{"temperature": 25.0, "state": "off", "setpoint": 180.0}
```

`state` is `off`, `heating`, or `ready`. The sketch subscribes to the chosen oven and publishes plain text to `line/oven/{n}/command`:

- `start` heats toward the setpoint (default 180)
- `stop` turns the oven off and lets the temperature fall
- a number sets the setpoint

The line also publishes a heartbeat on `line/ping`.
