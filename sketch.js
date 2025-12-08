// Adding status indicators for MQTT connection
let mqttStatus = "Connecting...";
let lastMqttMessage = "No messages yet";

// MQTT client configuration
const brokerHost = 'test.mosquitto.org';
const brokerPort = 8081; // Using WebSocket port
// Use secure WebSocket connection
const brokerURL = `wss://${brokerHost}:8081`;
let client;

// MQTT connection options
const options = {
    clientId: 'p5js_pizza_simulator_' + Math.random().toString(16).substr(2, 8),
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
    // Add SSL/TLS options
    protocol: 'wss',
    rejectUnauthorized: false
};


class Oven {
  constructor(x, y, id) {
    this.x = x;
    this.y = y;
    this.width = 200;
    this.height = 180;
    this.id = id;
    this.temperature = random(160, 220);
    this.humidity = random(40, 80);
    this.timer = 10;
    this.timerRunning = false;
    this.lastUpdate = millis();
    this.pizzaName = "Empty";
    this.pizzaStartTime = null;
    this.connected = false; // Add connection status
  }

  update() {
    if (!this.connected) return; // Don't update if not connected

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
      // Using clearer topic structure for educational purposes
      const baseTopic = `p5js/student/oven${this.id}`;
      
      client.publish(`${baseTopic}/temperature`, this.temperature.toFixed(1));
      client.publish(`${baseTopic}/humidity`, this.humidity.toFixed(1));
      client.publish(`${baseTopic}/timer`, this.timer.toString());
      client.publish(`${baseTopic}/pizza_name`, this.pizzaName);
    }
  }

  display() {
    push();
    // Draw connection status indicator
    stroke(this.timerRunning ? color(0, 255, 0) : this.pizzaName === "Empty" ?  color(255, 0, 0) : color(0, 0, 255));
    strokeWeight(2);
    
    // Draw oven box
    fill(240);
    rectMode(CENTER);
    rect(this.x, this.y, this.width, this.height, 20);

    // Display oven info
    textAlign(CENTER);
    textSize(25);
    fill(0);
    text(`Oven ${this.id}`, this.x, this.y - 60);
    
    // Display pizza name with status colors
    if (this.pizzaName === "Empty") {
      fill(200);
    }
    text(`Pizza: ${this.pizzaName}`, this.x, this.y - 35);
    
    // Display sensor values
    fill(0);
    textSize(22);
    text(`Temp: ${this.temperature.toFixed(1)}°C`, this.x, this.y);
    text(`Humidity: ${this.humidity.toFixed(1)}%`, this.x, this.y + 25);
    text(`Timer: ${this.timer}s`, this.x, this.y + 50);

    pop();
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
  createCanvas(1024, 768); // Increased height for status display
  
  ovens.push(new Oven(150, 500, 'A'));
  ovens.push(new Oven(400, 500, 'B'));
  ovens.push(new Oven(650, 500, 'C'));

  // Setup MQTT client with connection options
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
    
    // Subscribe to control topics
    const topics = [
      'pizzaoven/student/+/timer/reset',
      'pizzaoven/student/+/pizza/set'
    ];
    
    topics.forEach(topic => client.subscribe(topic));
    
    // Set all ovens as connected
    ovens.forEach(oven => oven.connected = true);
  });

  client.on('message', (topic, message) => {
    lastMqttMessage = `Topic: ${topic}, Message: ${message.toString()}`;
    
    // Extract oven ID from topic
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
  background(255);
  frameRate(0.5);
  // Display MQTT status
  fill(0);
  textAlign(LEFT);
  textSize(25);
  text(`MQTT Status: ${mqttStatus}`, 10, 20);
  text(`Last Message: ${lastMqttMessage}`, 10, 50);
  console.log(`Last Message: ${lastMqttMessage}`);
  
  // Display connection instructions
  textSize(25);
  text("Topics to publish:", 10, 90);
  text("MQTT broker = test.mosquitto.org", 10, 120);
  text("MQTT Port = 8081", 10,150); 
  text("(Replace '<oven>' with 'ovenA','ovenB' or 'ovenC')", 10, 360);
  fill(255,0,0);
  textStyle(BOLD);
  text("Publish Topic:", 10, 180);
  text("Subscribe Topic:", 10, 270);
  fill(0,0,255);
  textStyle(NORMAL);
  text("    pizzaoven/student/<oven>/pizza/set - Set pizza name", 10, 210);
  text("    pizzaoven/student/<oven>/timer/reset - Reset timer", 10, 240);
  text("    p5js/student/<oven>/temperature - Oven Temperature", 10, 300);
  text("    p5js/student/<oven>/humidity - Oven Humidity", 10, 330);
  

  for (let oven of ovens) {
    oven.update();
    oven.display();
  }
}