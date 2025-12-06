// --- LIBRERÍAS ---
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MLX90614.h>

// --- CREDENCIALES DE RED WIFI ---
#define WIFI_SSID "UNAMAD WIFI"
#define WIFI_PSWD "12345678"

// --- CREDENCIALES DEL SERVIDOR UBIDOTS ---
#define HTTP_SERVER "industrial.api.ubidots.com"
#define HTTP_PORT 80
#define HTTP_TOKEN "BBUS-IR3o21KJ1IzCiyoZdgrk8mISuwr317"
#define DEVICE_LABEL "esp32_proyecto"

// --- Clientes WiFi/HTTP ---
WiFiClient espClient;
HTTPClient httpClient;
char dataJSON[200]; // Buffer para crear el string JSON

// PINES PARA ESP32
#define pulsoPin 34
#define buzzerPin 2
#define sdaPin 21
#define sclPin 22

// UMBRALES DE ALARMA PARA TEMPERATURA
#define tempBaja 20.0
#define tempAlta 37.0

// UMBRALES DE FRECUENCIA CARDÍACA (BPM)
#define bpmBajo 60       // Inicio rango normal
#define bpmNormal 100    // Final rango normal

//  VARIABLES PARA EL CÁLCULO DE BPM 
int BPM = 0;
int pulsoValor = 0;
float temp = 0.0;
int buzzerStatus = 0; // 0 = OFF, 1 = Alerta Temp, 2 = BPM Bajo, 3 = BPM Alto
String estadoBPM = "Iniciando...";

#define pulseThreshold 2850 // Umbral de detección
unsigned long lastBeatTime = 0;
boolean beatInProgress = false;

// VARIABLES PARA EL CONTROL DEL BUZZER CON BPM
unsigned long lastBuzzerTime = 0;
int buzzerInterval = 1000; // Intervalo entre beeps (calculado según BPM)
boolean buzzerBeepState = false;

// VARIABLES PARA EL TEMPORIZADOR DE PANTALLA (Y ENVÍO) 
unsigned long lastUpdateTime = 0;
#define updateInterval 2000 // Intervalo de 2 segundos

// Inicializar LCD y Sensor
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_MLX90614 sensor = Adafruit_MLX90614();

// Prototipo de funciones
void wifiConnect(void);
void controlarBuzzerBPM(void);

//  CONFIGURACIÓN (SETUP)
void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Monitor de Signos Vitales con Alarmas Inteligentes ---");

  // Conectar al WiFi
  wifiConnect();

  // Iniciar I2C
  Wire.begin(sdaPin, sclPin);
  
  // Iniciar LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); 
  lcd.print("Iniciando..."); 
  delay(1000);
  
  // Iniciar Buzzer
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  // Iniciar Sensor de Temp.
  if (!sensor.begin()) {
    Serial.println("Error: No se encontró el sensor MLX90614.");
    lcd.clear();
    lcd.print("Error sensor");
    while (1);
  }
  Serial.println("Sensor MLX90614 encontrado. Sistema listo.");
  
  // Establecer el tiempo inicial
  lastUpdateTime = millis();
  lastBuzzerTime = millis();
}

//  BUCLE PRINCIPAL (LOOP)
void loop() {
  
  // Medir el pulso (Se ejecuta muy rápido) 
  pulsoValor = analogRead(pulsoPin);
  
  // Lógica para detectar el pico del latido
  if (pulsoValor > pulseThreshold && !beatInProgress) {
    unsigned long timeNow = millis();
    unsigned long IBI = timeNow - lastBeatTime; // Intervalo Entre Latidos (ms)

    if (IBI > 300 && IBI < 2000) { // Filtrar rango humano (30-200 BPM)
      BPM = 60000 / IBI; // Calcular BPM
    }
    lastBeatTime = timeNow;
    beatInProgress = true;
  } 
  else if (pulsoValor < pulseThreshold && beatInProgress) {
    beatInProgress = false; // Listo para el próximo latido
  }

  // Controlar el buzzer según BPM (se ejecuta continuamente)
  controlarBuzzerBPM();

  // Actualizar Pantalla y Enviar a Nube 
  unsigned long timeNow = millis();
  if (timeNow - lastUpdateTime > updateInterval) {
    lastUpdateTime = timeNow; // Resetea el temporizador

    // Leer temperatura (solo cada 2 seg)
    temp = sensor.readObjectTempC();

    // --- Determinar Estado y Alarmas según BPM ---
    if (BPM == 0) {
      estadoBPM = "Sin lectura";
      buzzerStatus = 0;
      buzzerInterval = 0; // No sonar
    }
    else if (BPM < bpmBajo) {
      estadoBPM = "BAJO";
      buzzerStatus = 2;
      buzzerInterval = 400; // Beeps lentos
    }
    else if (BPM >= bpmBajo && BPM <= bpmNormal) {
      estadoBPM = "Normal";
      buzzerStatus = 0;
      buzzerInterval = 0; // No sonar cuando está normal
    }
    else { // BPM > 100
      estadoBPM = "ALTO";
      buzzerStatus = 3;
      buzzerInterval = 200; // Beeps rápidos
    }

    // Revisar si hay alerta de temperatura (prioridad sobre BPM)
    if (temp < tempBaja || temp > tempAlta) {
      estadoBPM = "TEMP!";
      buzzerStatus = 1;
      buzzerInterval = 250; // Beeps rápidos para temperatura
    }

    // --- Enviar a Ubidots (Método HTTP) ---
    if (WiFi.status() == WL_CONNECTED) {
      
      // 1. Formatear los datos en JSON (SOLO 3 variables)
      sprintf(dataJSON,
        "{\"TemperaturaC\":%.2f,\"BPM\":%d,\"Buzzer\":%d}",
        temp, BPM, buzzerStatus
      );

      // 2. Configurar la petición HTTP
      String endpoint = "/api/v1.6/devices/" + String(DEVICE_LABEL) + "/";
      httpClient.begin(espClient, HTTP_SERVER, HTTP_PORT, endpoint.c_str());
      httpClient.addHeader("X-Auth-Token", HTTP_TOKEN);
      httpClient.addHeader("Content-Type", "application/json");

      Serial.println("--- Enviando a Ubidots ---");
      Serial.println("Payload: " + String(dataJSON));

      // 3. Realizar la solicitud HTTP con POST
      int respHTTP = httpClient.POST(dataJSON);
      
      if(respHTTP == 200) {
        Serial.printf("✓ Datos enviados OK (Código: %d)\n", respHTTP);
      } else {
        Serial.printf("✗ Error HTTP (Código: %d)\n", respHTTP);
        String response = httpClient.getString();
        Serial.println("Respuesta: " + response);
      }
      httpClient.end();
      
    } else {
      Serial.println("WiFi desconectado. Intentando reconectar...");
      wifiConnect();
    }

    // --- Imprimir al Monitor Serial ---
    Serial.print("BPM: "); Serial.print(BPM);
    Serial.print(" ("); Serial.print(estadoBPM); Serial.print(")");
    Serial.print(" | Temp: "); Serial.print(temp, 1);
    Serial.print("°C | Buzzer: ");
    if (buzzerInterval > 0) {
      Serial.print("ON ("); Serial.print(buzzerInterval); Serial.println(" ms)");
    } else {
      Serial.println("OFF");
    }

    // --- Mostrar en el LCD ---
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("BPM:"); lcd.print(BPM);
    lcd.print(" "); lcd.print(estadoBPM);
    lcd.setCursor(0, 1);
    lcd.print("Temp:"); lcd.print(temp, 1);
    lcd.print("C");
    
    Serial.println("------------------------------------");
  }
  delay(10); 
}

//  CONTROL DEL BUZZER SEGÚN BPM
void controlarBuzzerBPM(void) {
  // Si no hay alarma (buzzerInterval = 0), apagar el buzzer
  if (buzzerInterval == 0) {
    digitalWrite(buzzerPin, LOW);
    return;
  }

  // Control de beeps periódicos según el intervalo calculado
  unsigned long timeNow = millis();
  if (timeNow - lastBuzzerTime >= buzzerInterval) {
    lastBuzzerTime = timeNow;
    buzzerBeepState = !buzzerBeepState; // Alternar estado
    
    if (buzzerBeepState) {
      digitalWrite(buzzerPin, HIGH); // Encender
    } else {
      digitalWrite(buzzerPin, LOW);  // Apagar
    }
  }
}

//  CONEXIÓN WIFI
void wifiConnect (void) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PSWD);
  
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(1000);
  }
  
  Serial.println("\n✓ WiFi Conectado!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}