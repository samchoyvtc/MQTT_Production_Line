#!/usr/bin/env python3
"""Four ovens on the MQTT Production line.

Each oven publishes JSON on line/oven/{n}/status about once a second and
subscribes to line/oven/{n}/command. A heartbeat is published on line/ping.

Commands are plain text: start, stop, or a setpoint number.
start heats toward the setpoint (default 180). stop turns the oven off and
lets the temperature fall. Reaching the setpoint sets state to ready.
"""

from __future__ import annotations

import argparse
import json
import math
import threading
import time

import paho.mqtt.client as mqtt

AMBIENT = 25.0
DEFAULT_SETPOINT = 180.0
HEAT_RATE = 8.0
COOL_RATE = 5.0
READY_TOLERANCE = 0.5
LINE_NAME = "MQTT Production line"


class Oven:
    def __init__(self, number: int) -> None:
        self.number = number
        self.temperature = AMBIENT
        self.setpoint = DEFAULT_SETPOINT
        self.state = "off"

    def at_setpoint(self) -> bool:
        return abs(self.temperature - self.setpoint) <= READY_TOLERANCE

    def handle(self, raw: str) -> bool:
        text = raw.strip()
        if not text:
            return False
        lower = text.lower()
        if lower == "start":
            self.state = "ready" if self.at_setpoint() else "heating"
            return True
        if lower == "stop":
            self.state = "off"
            return True
        try:
            value = float(text)
        except ValueError:
            print(f"oven {self.number} ignored command {text!r}")
            return False
        if not math.isfinite(value):
            print(f"oven {self.number} ignored command {text!r}")
            return False
        self.setpoint = value
        if self.state != "off":
            self.state = "ready" if self.at_setpoint() else "heating"
        return True

    def tick(self) -> None:
        if self.state == "off":
            self._approach(AMBIENT, COOL_RATE)
            return
        self._approach(self.setpoint, HEAT_RATE)
        if self.at_setpoint():
            self.temperature = self.setpoint
            self.state = "ready"
        else:
            self.state = "heating"

    def status(self) -> dict:
        return {
            "temperature": round(self.temperature, 1),
            "state": self.state,
            "setpoint": round(self.setpoint, 1),
        }

    def _approach(self, target: float, rate: float) -> None:
        delta = target - self.temperature
        if abs(delta) <= rate:
            self.temperature = target
        elif delta > 0:
            self.temperature += rate
        else:
            self.temperature -= rate


class ProductionLine:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.ovens = {n: Oven(n) for n in range(1, 5)}
        self.lock = threading.Lock()
        if hasattr(mqtt, "CallbackAPIVersion"):
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id="production-line-ovens",
            )
        else:
            self.client = mqtt.Client(client_id="production-line-ovens")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    def serve(self) -> None:
        print(LINE_NAME)
        print(f"broker {self.host}:{self.port}")
        print("status  line/oven/{1-4}/status")
        print("command line/oven/{1-4}/command")
        print("ping    line/ping")
        self.client.connect(self.host, self.port, keepalive=30)
        self.client.loop_start()
        try:
            while True:
                time.sleep(1)
                with self.lock:
                    for oven in self.ovens.values():
                        oven.tick()
                self.publish_all()
        except KeyboardInterrupt:
            print("stopping ovens")
        finally:
            self.client.loop_stop()
            self.client.disconnect()

    def publish_all(self) -> None:
        for oven in self.ovens.values():
            self.publish_status(oven)
        ping = json.dumps({"line": LINE_NAME, "t": round(time.time(), 3)})
        self.client.publish("line/ping", ping, qos=0, retain=False)

    def publish_status(self, oven: Oven) -> None:
        with self.lock:
            payload = json.dumps(oven.status())
        self.client.publish(
            f"line/oven/{oven.number}/status",
            payload,
            qos=0,
            retain=True,
        )

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if getattr(reason_code, "is_failure", False):
            print(f"connect failed: {reason_code}")
            return
        client.subscribe("line/oven/+/command")
        print("ovens connected")
        self.publish_all()

    def _on_message(self, client, userdata, message) -> None:
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[0] != "line" or parts[1] != "oven" or parts[3] != "command":
            return
        try:
            number = int(parts[2])
        except ValueError:
            return
        oven = self.ovens.get(number)
        if oven is None:
            return
        text = message.payload.decode("utf-8", errors="replace")
        with self.lock:
            accepted = oven.handle(text)
            state = oven.state
            temperature = oven.temperature
            setpoint = oven.setpoint
        if not accepted:
            return
        print(
            f"oven {number} command {text.strip()!r} -> {state} "
            f"@ {temperature:.1f} setpoint {setpoint:.1f}"
        )
        self.publish_status(oven)


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate four production-line ovens")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1883)
    args = parser.parse_args()
    ProductionLine(args.host, args.port).serve()


if __name__ == "__main__":
    main()
