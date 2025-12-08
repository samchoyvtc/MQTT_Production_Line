
// ==========================================
// CONFIGURATION & STYLING
// ==========================================

// Color Palette for Professional Appearance
const THEME = {
  bg: '#1a1c23',           // Dark background
  cardBg: '#252830',       // Card background
  textMain: '#ffffff',     // White text
  textMuted: '#8b9bb4',    // Gray text
  accent: '#79589f',       // Purple accent
  success: '#2ecc71',      // Green
  warning: '#f1c40f',      // Yellow
  danger: '#e74c3c',       // Red
  cold: '#3498db',         // Blue
  hot: '#e67e22'           // Orange
};

// Adding status indicators for MQTT connection
let mqttStatus = "Connecting...";
let lastMqttMessage = "No messages yet";

// MQTT client configuration
const brokerHost = 'test.mosquitto.org';
const brokerPort = 8081; // Using WebSocket port
// Use secure WebSocket connection
const brokerURL = `wss://${brokerHost}:8081`;
let client;

// ==========================================
// OVEN CLASS
// ==========================================

class Oven {
  constructor(x, y, id) {
    this.x = x;
    this.y = y;
    this.width = 220;  // Slightly wider for better UI
    this.height = 300; // Taller to fit gauges
    this.id = id;
    this.temperature = random(160, 220);
    this.humidity = random(40, 80);
    this.timer = 10;
    this.timerRunning = false;
    this.lastUpdate = millis();
    this.pizzaName = "Empty";
    this.pizzaStartTime = null;
    this.connected = false; 
  }

  update() {
    if (!this.connected) return; 

    this.temperature += random(-1.5, 1.5);
    this.humidity += random(-1.5, 1.5);
    
    this.temperature = constrain(this.temperature, 180, 220);
    this.humidity = constrain(this.humidity, 40, 60);

    if (this.timerRunning && millis() - this.lastUpdate >= 1000) {
      this.timer--;
      this.lastUpdate = millis();
      if (this.timer <= 0) {
        this.timerRunning = false;
        this.timer = 0;
        this.setPizzaName("Empty");
      }
    }

    this.publishData();
  }

  publishData() {
    if (client && client.connected) {
      const baseTopic = `p5js/student/oven${this.id}`;
      client.publish(`${baseTopic}/temperature`, this.temperature.toFixed(1));
      client.publish(`${baseTopic}/humidity`, this.humidity.toFixed(1));
      client.publish(`${baseTopic}/timer`, this.timer.toString());
      client.publish(`${baseTopic}/pizza_name`, this.pizzaName);
    }
  }

  display() {
    push();
    translate(this.x, this.y);

    // 1. Draw Card Background
    noStroke();
    fill(THEME.cardBg);
    // Add subtle glow based on status
    if(this.timerRunning) {
        drawingContext.shadowBlur = 20;
        drawingContext.shadowColor = THEME.success;
    } else if (this.pizzaName !== "Empty") {
        drawingContext.shadowBlur = 20;
        drawingContext.shadowColor = THEME.cold;
    } else {
        drawingContext.shadowBlur = 0;
    }
    
    rectMode(CENTER);
    rect(0, 0, this.width, this.height, 12); // Rounded corners
    drawingContext.shadowBlur = 0; // Reset shadow

    // 2. Header (Oven ID)
    fill(THEME.textMain);
    textAlign(CENTER, TOP);
    textSize(20);
    textStyle(BOLD);
    text(`Oven ${this.id}`, 0, -this.height/2 + 20);

    // 3. Status Badge (Connected/Active)
    let statusColor = this.connected ? (this.timerRunning ? THEME.success : THEME.warning) : THEME.danger;
    let statusText = this.connected ? (this.timerRunning ? "COOKING" : "IDLE") : "OFFLINE";
    
    fill(statusColor);
    rect(0, -this.height/2 + 55, 80, 24, 12);
    fill(0); // Text inside badge
    textSize(10);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    text(statusText, 0, -this.height/2 + 55);

    // 4. Pizza Display (The "Window")
    fill(0, 0, 0, 100); // Dark window background
    rect(0, -20, this.width - 40, 80, 8);
    
    fill(THEME.textMain);
    textSize(16);
    textStyle(NORMAL);
    if (this.pizzaName === "Empty") {
        fill(THEME.textMuted);
        text("No Pizza", 0, -20);
    } else {
        fill(THEME.warning);
        text(this.pizzaName, 0, -25);
        // Timer below pizza name
        fill(THEME.textMain);
        textSize(24);
        textStyle(BOLD);
        text(`${this.timer}s`, 0, 5);
    }

    // 5. Gauges (Temperature & Humidity)
    this.drawGauge("Temp", this.temperature, 180, 220, THEME.danger, 60);
    this.drawGauge("Humidity", this.humidity, 40, 60, THEME.cold, 100);

    pop();
  }

  // Helper to draw progress bars
  drawGauge(label, value, minVal, maxVal, colorHex, yPos) {
    const barWidth = 160;
    const barHeight = 6;
    const percentage = map(value, minVal, maxVal, 0, 1);
    const constrainedPct = constrain(percentage, 0, 1);

    textAlign(LEFT);
    textSize(12);
    fill(THEME.textMuted);
    text(label, -barWidth/2, yPos);
    
    textAlign(RIGHT);
    fill(THEME.textMain);
    text(value.toFixed(1) + (label === "Temp" ? "°C" : "%"), barWidth/2, yPos);

    // Background Bar
    rectMode(CORNER);
    fill(255, 255, 255, 20);
    rect(-barWidth/2, yPos + 8, barWidth, barHeight, 3);

    // Fill Bar
    fill(colorHex);
    rect(-barWidth/2, yPos + 8, barWidth * constrainedPct, barHeight, 3);
  }

  setPizzaName(name) {
    this.pizzaName = name;
    if (name !== "Empty") {
      this.pizzaStartTime = millis();
    } else {
      this.pizzaStartTime = null;
    }
  }

  resetTimer() {
    this.timer = 10;
    this.timerRunning = true;
    this.lastUpdate = millis();
  }
}

let ovens = [];

function setup() {
  createCanvas(1024, 768);
  textFont('Helvetica'); // Use a clean font
  
  // Adjusted positions to center them nicely
  ovens.push(new Oven(250, 400, 'A'));
  ovens.push(new Oven(512, 400, 'B'));
  ovens.push(new Oven(774, 400, 'C'));

  // Setup MQTT client
  const options = {
    clientId: 'p5js_pizza_simulator_' + Math.random().toString(16).substr(2, 8),
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  };

  client = mqtt.connect(brokerURL, options);
  
  client.on('connect', () => {
    mqttStatus = "Connected to MQTT broker";
    console.log('Connected to MQTT broker');
    
    const topics = [
      'pizzaoven/student/+/timer/reset',
      'pizzaoven/student/+/pizza/set'
    ];
    
    topics.forEach(topic => client.subscribe(topic));
    
    ovens.forEach(oven => oven.connected = true);
  });

  client.on('message', (topic, message) => {
    lastMqttMessage = `${topic} \n -> ${message.toString()}`;
    
    const topicParts = topic.split('/');
    const ovenId = topicParts[2].replace('oven', '');
    const oven = ovens.find(o => o.id === ovenId);
    
    if (!oven) return;

    if (topic.includes('timer/reset')) {
      oven.resetTimer();
    } else if (topic.includes('pizza/set')) {
      oven.setPizzaName(message.toString());
    }
  });

  client.on('error', (error) => {
    mqttStatus = `Error: ${error.message}`;
    console.error('MQTT Error:', error);
  });

  client.on('close', () => {
    mqttStatus = "Disconnected from broker";
    ovens.forEach(oven => oven.connected = false);
  });
}

function draw() {
  background(THEME.bg);
  frameRate(0.5); // Keeping original low framerate to maintain simulation logic speed

  // ==========================
  // DASHBOARD HEADER
  // ==========================
  fill(THEME.cardBg);
  noStroke();
  rectMode(CORNER);
  rect(0, 0, width, 80); // Top bar

  // Title
  fill(THEME.textMain);
  textSize(28);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text("IoT Pizza Oven Simulator", 30, 40);

  // Connection Status (Top Right)
  textAlign(RIGHT, CENTER);
  textSize(16);
  textStyle(NORMAL);
  if(mqttStatus.includes("Connected")) fill(THEME.success);
  else fill(THEME.danger);
  text(mqttStatus, width - 30, 40);

  // ==========================
  // BOTTOM INFO PANEL
  // ==========================
  
  // Divider Line
  stroke(THEME.cardBg);
  strokeWeight(2);
  line(30, 600, width-30, 600);
  noStroke();

  // Instructions Column (Left)
  textAlign(LEFT, TOP);
  fill(THEME.textMuted);
  textSize(14);
  text("CONFIGURATION", 30, 620);
  
  fill(THEME.textMain);
  textSize(16);
  text(`Broker: ${brokerHost}`, 30, 650);
  text(`Port: ${brokerPort}`, 30, 675);
  
  // Topics Column (Middle)
  fill(THEME.textMuted);
  textSize(14);
  text("MQTT TOPICS (Replace <oven> with ovenA, ovenB, ovenC)", 300, 620);

  textSize(15);
  // Subscribe
  fill(THEME.accent);
  text("Subscribing to:", 300, 650);
  fill(THEME.textMain);
  text("pizzaoven/student/<oven>/pizza/set", 420, 650);
  text("pizzaoven/student/<oven>/timer/reset", 420, 675);

  // Publish
  fill(THEME.success);
  text("Publishing to:", 300, 710);
  fill(THEME.textMain);
  text("p5js/student/<oven>/temperature", 420, 710);
  text("p5js/student/<oven>/humidity", 420, 735);

  // Log Column (Right)
  fill(THEME.textMuted);
  textSize(14);
  text("LAST RECEIVED MESSAGE", 750, 620);
  
  // Log Box
  fill(0, 0, 0, 50);
  rect(750, 645, 240, 80, 4);
  
  fill(THEME.warning);
  textSize(12);
  textLeading(16);
  text(lastMqttMessage, 760, 655, 220, 70); // Text wrapping

  // ==========================
  // RENDER OVENS
  // ==========================
  for (let oven of ovens) {
    oven.update();
    oven.display();
  }
}
