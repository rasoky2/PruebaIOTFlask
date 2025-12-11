import time
import json
import random
import urllib.request
import urllib.error
import sys

# Configuración
# Intenta conectarse a localhost por defecto
SERVER_URL = "http://127.0.0.1:5000/api/sensor_update"

def send_data(temp, bpm, status):
    data = {
        "temperature": temp,
        "bpm": bpm,
        "status": status
    }
    
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(SERVER_URL, data=json_data, headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            print(f"✅ Enviado: BPM={bpm} Temp={temp}°C ({status}) | Server: {response.getcode()}")
    except urllib.error.URLError as e:
        print(f"❌ Error conectando a {SERVER_URL}")
        print(f"   Detalle: {e}")
        print("   -> Asegúrate de que 'python app.py' esté corriendo en otra terminal.")

print(f"\n=== Simulador ESP32 (HTTP Client) ===")
print(f"Destino: {SERVER_URL}")
print("Generando signos vitales aleatorios...")
print("Presiona CTRL+C para detener\n")

try:
    while True:
        # Generar datos aleatorios realistas
        # Temperatura entre 36.0 y 37.5 (Normal)
        temp = round(random.uniform(36.0, 37.5), 1)
        
        # BPM entre 60 y 90 (Normal)
        bpm = random.randint(60, 90)
        status = "Normal"
        
        # 10% de probabilidad de simular taquicardia/fiebre para probar alertas
        if random.random() < 0.1:
            bpm = random.randint(110, 140)
            status = "ALTO"
        
        if random.random() < 0.05:
            temp = round(random.uniform(38.0, 39.5), 1)
            status = "TEMP!"

        send_data(temp, bpm, status)
        time.sleep(2) # Simular intervalo del ESP32

except KeyboardInterrupt:
    print("\n🛑 Simulación detenida.")
