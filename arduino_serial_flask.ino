// Código ESP32 para comunicación HTTP con Flask
// Sensor de temperatura: MLX90614
// Sensor de pulso: Sensor analógico en pin 34

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <WiFi.h>
#include <HTTPClient.h>

// --- CONFIGURACIÓN WIFI Y SERVIDOR ---
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";
String serverName = "http://192.168.1.X:5000/api/sensor_update"; // CAMBIAR POR LA IP DE TU PC

// PINES ESP32
#define pulsoPin 34      // Pin analógico para sensor de pulso
#define buzzerPin 2      // Pin digital para buzzer
#define sdaPin 21        // Pin SDA para I2C
#define sclPin 22        // Pin SCL para I2C

// Umbrales
#define tempBaja 20.0
#define tempAlta 37.0
#define bpmBajo 60
#define bpmNormal 100
#define pulseThreshold 2850

// Variables
int BPM = 0;
int pulsoValor = 0;
float temp = 0.0;
unsigned long lastBeatTime = 0;
boolean beatInProgress = false;

Adafruit_MLX90614 sensor = Adafruit_MLX90614();
unsigned long lastUpdateTime = 0;
#define updateInterval 2000

WiFiClient client;
HTTPClient http;

void setup() {

  // Conectar WiFi
  WiFi.begin(ssid, password);
  while(WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  // Inicializar I2C para sensor de temperatura
  Wire.begin(sdaPin, sclPin);
  
  // Configurar buzzer
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
  
  // Inicializar sensor de temperatura MLX90614
  if (!sensor.begin()) {
    // Error: Sensor no encontrado (sin Serial no podemos avisar facilmente, quizas parpadear LED o buzzer)
    while (1);
  }
}

void loop() {
  pulsoValor = analogRead(pulsoPin);
  
  if (pulsoValor > pulseThreshold && !beatInProgress) {
    unsigned long timeNow = millis();
    unsigned long IBI = timeNow - lastBeatTime;
    
    if (IBI > 300 && IBI < 2000) {
      BPM = 60000 / IBI;
    }
    lastBeatTime = timeNow;
    beatInProgress = true;
  } 
  else if (pulsoValor < pulseThreshold && beatInProgress) {
    beatInProgress = false;
  }
  
  unsigned long timeNow = millis();
  if (timeNow - lastUpdateTime > updateInterval) {
    lastUpdateTime = timeNow;
    
    temp = sensor.readObjectTempC();
    
    String estadoBPM = "Normal";
    boolean alerta = false;
    
    if (BPM == 0) {
      estadoBPM = "Sin lectura";
    }
    else if (BPM < bpmBajo) {
      estadoBPM = "BAJO";
      alerta = true;
    }
    else if (BPM > bpmNormal) {
      estadoBPM = "ALTO";
      alerta = true;
    }
    
    if (temp < tempBaja || temp > tempAlta) {
      estadoBPM = "TEMP!";
      alerta = true;
    }
    
    if (alerta) {
      digitalWrite(buzzerPin, HIGH);
      delay(100);
      digitalWrite(buzzerPin, LOW);
    }
    
    // Enviar por HTTP
    if(WiFi.status() == WL_CONNECTED){
      http.begin(client, serverName);
      http.addHeader("Content-Type", "application/json"); // Especificar JSON

      // Crear JSON Manualmente
      String jsonPayload = "{";
      jsonPayload += "\"temperature\":" + String(temp, 2) + ",";
      jsonPayload += "\"bpm\":" + String(BPM) + ",";
      jsonPayload += "\"status\":\"" + estadoBPM + "\"";
      jsonPayload += "}";

      http.POST(jsonPayload);
      http.end();
    }
  }
  
  delay(10);
}

