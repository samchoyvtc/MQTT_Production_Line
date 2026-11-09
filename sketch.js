// Student assessment sheet for the MQTT Production line.
// Open this page over http://<teacher-lan-address>:<page-port>/ from any
// laptop on the classroom Wi-Fi. The broker host is the page hostname, so
// the WebSocket reaches Mosquitto on that same machine at port 9001.

const LINE_NAME = "MQTT Production line";
const brokerHost = window.location.hostname || "localhost";
const brokerPort = 9001;
const useSSL = false;
const clientId = "oven" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let client = null;
let mqttLib = null;
let connecting = false;
let reconnectTimer = null;
let chosenOven = 1;
let subscribedTopic = null;
let connectionStatus = "Starting";
let latestStatus = null;
let lastCommand = "none yet";
let lastCommandOven = null;

function statusTopic(oven) {
  return "line/oven/" + oven + "/status";
}

function commandTopic(oven) {
  return "line/oven/" + oven + "/command";
}

function setup() {
  const canvas = createCanvas(880, 640);
  canvas.parent("sheet");
  textFont("Arial, Helvetica, sans-serif");
  buildControls();
  connectLine();
}

function draw() {
  background("#1a1c23");
  drawHeader();
  drawBrokerCard();
  drawOvenCard();
  drawStatusCard();
}

function drawHeader() {
  noStroke();
  fill("#252830");
  rect(0, 0, width, 96);

  fill("#ffffff");
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(28);
  text(LINE_NAME, 28, 22);

  textStyle(NORMAL);
  textSize(16);
  fill(connectionColor());
  text("Connection: " + connectionStatus, 28, 60, 824, 24);
}

function drawBrokerCard() {
  card(20, 116, 840, 168);
  sectionTitle(40, 132, "Broker");
  field(40, 168, "Host", brokerHost);
  field(40, 198, "WebSocket port", String(brokerPort));
  field(40, 228, "SSL", useSSL ? "on" : "off");
  field(40, 258, "Client id", clientId);
}

function drawOvenCard() {
  card(20, 304, 840, 140);
  sectionTitle(40, 320, "Oven");
  field(40, 356, "Oven", String(chosenOven));
  field(40, 386, "Status topic", statusTopic(chosenOven));
  field(40, 416, "Command topic", commandTopic(chosenOven));
}

function drawStatusCard() {
  card(20, 464, 840, 152);
  sectionTitle(40, 480, "Latest oven status");

  const temperature = latestStatus ? formatTemperature(latestStatus.temperature) : "—";
  const state = latestStatus && latestStatus.state ? String(latestStatus.state) : "—";

  fill("#8b9bb4");
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(16);
  text("Temperature", 40, 516);
  text("State", 360, 516);

  fill("#ffffff");
  textStyle(BOLD);
  textSize(28);
  text(temperature, 40, 540);
  fill(stateColor(state));
  text(state, 360, 540);

  fill("#8b9bb4");
  textStyle(NORMAL);
  textSize(16);
  text("Last command sent", 40, 580);
  fill("#ffffff");
  text(lastCommandLabel(), 230, 580);
}

function card(x, y, w, h) {
  noStroke();
  fill("#252830");
  rect(x, y, w, h, 12);
}

function sectionTitle(x, y, label) {
  fill("#8b9bb4");
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(13);
  text(label.toUpperCase(), x, y);
}

function field(x, y, label, value) {
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(18);
  fill("#8b9bb4");
  text(label, x, y);
  fill("#ffffff");
  text(value, x + 210, y);
}

function connectionColor() {
  if (connectionStatus === "Connected") return "#2ecc71";
  if (connectionStatus.indexOf("fail") !== -1 || connectionStatus.indexOf("Disconnected") !== -1) {
    return "#e74c3c";
  }
  return "#f1c40f";
}

function stateColor(state) {
  if (state === "heating") return "#e67e22";
  if (state === "ready") return "#2ecc71";
  if (state === "off") return "#8b9bb4";
  return "#ffffff";
}

function formatTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(1) + " °C";
}

function lastCommandLabel() {
  if (lastCommandOven === null) return lastCommand;
  if (lastCommandOven === chosenOven) return lastCommand;
  return lastCommand + " (oven " + lastCommandOven + ")";
}

function buildControls() {
  const root = document.getElementById("controls");
  root.innerHTML = "";

  const picker = document.createElement("div");
  picker.id = "oven-picker";
  picker.className = "picker";
  for (let n = 1; n <= 4; n += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Oven " + n;
    button.dataset.oven = String(n);
    button.addEventListener("click", function () {
      selectOven(n);
    });
    picker.appendChild(button);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.appendChild(commandButton("Start", "start"));
  actions.appendChild(commandButton("Stop", "stop"));

  const setpoint = document.createElement("form");
  setpoint.className = "setpoint";
  const setpointLabel = document.createElement("label");
  setpointLabel.textContent = "Setpoint";
  setpointLabel.setAttribute("for", "setpoint");
  const input = document.createElement("input");
  input.id = "setpoint";
  input.type = "number";
  input.step = "any";
  input.value = "180";
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Send setpoint";
  setpoint.appendChild(setpointLabel);
  setpoint.appendChild(input);
  setpoint.appendChild(send);
  setpoint.addEventListener("submit", function (event) {
    event.preventDefault();
    const value = input.value.trim();
    if (value === "" || !Number.isFinite(Number(value))) return;
    sendCommand(value);
  });

  root.appendChild(picker);
  root.appendChild(actions);
  root.appendChild(setpoint);
  selectOven(1);
}

function commandButton(label, command) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", function () {
    sendCommand(command);
  });
  return button;
}

function selectOven(oven) {
  chosenOven = oven;
  latestStatus = null;
  const buttons = document.querySelectorAll("#oven-picker button");
  buttons.forEach(function (button) {
    button.classList.toggle("selected", Number(button.dataset.oven) === oven);
  });
  subscribeSelected();
}

// cdnjs paho-mqtt 1.1 exposes Paho.Client. Older mqttws31 builds expose Paho.MQTT.Client.
function pahoLibrary() {
  const root = window.Paho;
  if (!root) return null;
  if (root.MQTT && root.MQTT.Client && root.MQTT.Message) return root.MQTT;
  if (root.Client && root.Message) return root;
  return null;
}

function connectLine() {
  mqttLib = pahoLibrary();
  if (!mqttLib) {
    connectionStatus = "Paho MQTT failed to load";
    return;
  }
  if (!client) {
    client = new mqttLib.Client(brokerHost, brokerPort, "/mqtt", clientId);
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;
  }
  if (connecting || client.isConnected()) return;

  connecting = true;
  connectionStatus = "Connecting...";
  client.connect({
    useSSL: useSSL,
    timeout: 8,
    keepAliveInterval: 30,
    mqttVersion: 4,
    onSuccess: onConnected,
    onFailure: function (error) {
      connecting = false;
      connectionStatus = "Connection failed: " + (error && error.errorMessage ? error.errorMessage : "broker unreachable");
      scheduleReconnect();
    }
  });
}

function onConnected() {
  connecting = false;
  connectionStatus = "Connected";
  subscribedTopic = null;
  subscribeSelected();
}

function onConnectionLost(response) {
  connecting = false;
  if (response && response.errorCode === 0) {
    connectionStatus = "Disconnected";
  } else {
    connectionStatus = "Disconnected: " + (response && response.errorMessage ? response.errorMessage : "connection lost");
  }
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connectLine();
  }, 2000);
}

function subscribeSelected() {
  const topic = statusTopic(chosenOven);
  if (!client || !client.isConnected()) return;
  if (subscribedTopic && subscribedTopic !== topic) {
    client.unsubscribe(subscribedTopic);
  }
  subscribedTopic = topic;
  client.subscribe(topic);
}

function onMessageArrived(message) {
  if (message.destinationName !== statusTopic(chosenOven)) return;
  const raw = message.payloadString;
  try {
    const data = JSON.parse(raw);
    latestStatus = {
      temperature: data.temperature,
      state: data.state
    };
  } catch (error) {
    latestStatus = { temperature: NaN, state: raw };
  }
}

function sendCommand(command) {
  const payload = String(command);
  if (!client || !client.isConnected()) {
    lastCommand = payload + " (not sent — disconnected)";
    lastCommandOven = chosenOven;
    return;
  }
  const message = new mqttLib.Message(payload);
  message.destinationName = commandTopic(chosenOven);
  client.send(message);
  lastCommand = payload;
  lastCommandOven = chosenOven;
}
