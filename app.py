from flask import Flask
from flask_cors import CORS
import threading
import json
import os
from schema.schema import (
    init_db,
    list_patient_records,
    create_patient,
    update_patient,
    delete_patient,
    update_patient_summary,
    save_session_record,
    list_patient_sessions,
)
from core.arduino import (
    latest_data,
    monitor_sensor_timeout,
    accumulate_session_data,
)
from api.api import register_routes

# Intentar importar configuración manual
try:
    from config.config import (
        TEMP_MIN, TEMP_MAX, BPM_MIN, BPM_MAX,
        FLASK_PORT, FLASK_HOST, FLASK_DEBUG,
        CONFIG_FILE as CONFIG_FILE_NAME
    )
    CONFIG_FILE = CONFIG_FILE_NAME
    print("Configuración manual cargada desde config/config.py")
except ImportError:
    # Valores por defecto si no existe config/config.py
    SERIAL_PORT = None # Ignorado
    SERIAL_BAUDRATE = 115200 # Ignorado
    TEMP_MIN = 20.0
    TEMP_MAX = 37.0
    BPM_MIN = 60
    BPM_MAX = 100
    FLASK_PORT = 5000
    FLASK_HOST = '0.0.0.0'
    FLASK_DEBUG = True
    CONFIG_FILE = 'config.json'
    print("Usando configuración por defecto (crea config/config.py para personalizar)")

app = Flask(__name__)
CORS(app)

# Base de datos manejada por schema.py

# Sesión de paciente en curso
session_state = {
    'active': False,
    'patient': None,  # {'name': str, 'identifier': str, 'age': int | None, 'start_time': float}
    'patient_db_id': None,
    'bpm_sum': 0,
    'bpm_count': 0,
    'min_bpm': None,
    'max_bpm': None,
    'last_temp': None
}

# Configuración por defecto (se puede sobrescribir desde config.py)
config = {
    'temp_min': TEMP_MIN,
    'temp_max': TEMP_MAX,
    'bpm_min': BPM_MIN,
    'bpm_max': BPM_MAX
}

def load_config():
    """Carga la configuración desde archivo"""
    global config
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                saved_config = json.load(f)
                config.update(saved_config)
        except Exception as e:
            print(f"Error cargando configuración: {e}")

def save_config():
    """Guarda la configuración en archivo"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Error guardando configuración: {e}")



# Funciones de Arduino manejadas por arduino.py


def _compute_avg_bpm():
    if session_state['bpm_count'] == 0:
        return 0
    return round(session_state['bpm_sum'] / session_state['bpm_count'], 1)


register_routes(app, {
    'config': config,
    'session_state': session_state,
    'latest_data': latest_data,
    'save_config': save_config,
    'save_session_record': save_session_record,
    'list_patient_records': list_patient_records,
    'list_patient_sessions': list_patient_sessions,
    'create_patient': create_patient,
    'update_patient': update_patient,
    'delete_patient': delete_patient,
    'update_patient_summary': update_patient_summary,
    'compute_avg_bpm': _compute_avg_bpm,
    'accumulate_session_data': accumulate_session_data,
})


if __name__ == '__main__':
    import socket
    import subprocess

    def print_connection_info(port):
        """Imprime la IP y SSID para facilitar la configuración del ESP32"""
        ip_address = "127.0.0.1"
        ssid = "Desconocido (¿Cable?)"
        
        # 1. Obtener IP Local real (la que sale a internet)
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80)) # Conectar a Google DNS (no envía datos)
            ip_address = s.getsockname()[0]
            s.close()
        except Exception:
            try:
                 ip_address = socket.gethostbyname(socket.gethostname())
            except:
                pass

        # 2. Obtener SSID (Solo Windows)
        try:
            output = subprocess.check_output("netsh wlan show interfaces", shell=True).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                if " SSID" in line and "BSSID" not in line:
                    ssid = line.split(':')[1].strip()
                    break
        except Exception:
            pass

        print("\n" + "="*60)
        print(f" SERVIDOR LISTO - DATOS PARA TU ESP32 (.ino)")
        print("="*60)
        print(f" - WIFI (SSID) :  \033[92m{ssid}\033[0m")
        print(f" - IP LOCAL    :  \033[96m{ip_address}\033[0m")
        print(f" - URL API        :  \033[93mhttp://{ip_address}:{port}/api/sensor_update\033[0m")
        print("-" * 60)
        print(" Copia estos datos en tu archivo 'arduino_serial_flask.ino'")
        print("="*60 + "\n")

    # Cargar configuración
    load_config()
    # Inicializar base de datos
    init_db()
    
    # Mostrar info de red
    print_connection_info(FLASK_PORT)
    
    # Iniciar thread para monitorear timeouts
    monitor_thread = threading.Thread(target=monitor_sensor_timeout, args=(config,), daemon=True)
    monitor_thread.start()
    
    # Iniciar servidor Flask
    app.run(debug=FLASK_DEBUG, host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)

