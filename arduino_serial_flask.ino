// Código ESP32 para comunicación Serial con Flask
// Sensor de temperatura: MLX90614
// Sensor de pulso: Sensor analógico en pin 34
// NOTA: Este código es para ESP32, NO para Arduino UNO

#include <Wire.h>
#include <Adafruit_MLX90614.h>

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

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== Monitor Cardiaco ESP32 ===");
  Serial.println("Comunicacion Serial con Flask");
  
  // Inicializar I2C para sensor de temperatura
  Wire.begin(sdaPin, sclPin);
  
  // Configurar buzzer
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
  
  // Inicializar sensor de temperatura MLX90614
  if (!sensor.begin()) {
    Serial.println("Error: Sensor MLX90614 no encontrado");
    while (1);
  }
  
  Serial.println("Sistema iniciado. Listo para Flask.");
  Serial.println("Formato: BPM: XX (Estado) | Temp: XX.X°C | Buzzer: OFF");
  Serial.println("------------------------------------");
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
    
    Serial.print("BPM: ");
    Serial.print(BPM);
    Serial.print(" (");
    Serial.print(estadoBPM);
    Serial.print(") | Temp: ");
    Serial.print(temp, 1);
    Serial.println("°C | Buzzer: OFF");
  }
  
  delay(10);
}

