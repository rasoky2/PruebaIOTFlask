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
    arduino_ctx,
    latest_data,
    init_arduino,
    read_arduino_loop,
)
from core.arduino_serial import ArduinoReader
from api.api import register_routes

# Intentar importar configuración manual
try:
    from config.config import (
        SERIAL_PORT, SERIAL_BAUDRATE, SERIAL_TIMEOUT,
        TEMP_MIN, TEMP_MAX, BPM_MIN, BPM_MAX,
        UPDATE_INTERVAL_MS, FLASK_PORT, FLASK_HOST, FLASK_DEBUG,
        CONFIG_FILE as CONFIG_FILE_NAME
    )
    CONFIG_FILE = CONFIG_FILE_NAME
    print("Configuración manual cargada desde config/config.py")
except ImportError:
    # Valores por defecto si no existe config/config.py
    SERIAL_PORT = None
    SERIAL_BAUDRATE = 115200
    SERIAL_TIMEOUT = 1
    TEMP_MIN = 20.0
    TEMP_MAX = 37.0
    BPM_MIN = 60
    BPM_MAX = 100
    UPDATE_INTERVAL_MS = 500
    FLASK_PORT = 5000
    FLASK_HOST = '0.0.0.0'
    FLASK_DEBUG = True
    CONFIG_FILE = 'config.json'
    print("Usando configuración por defecto (crea config/config.py para personalizar)")

app = Flask(__name__)
CORS(app)

# Base de datos manejada por schema.py

# Arduino manejado por arduino.py

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
    'port': SERIAL_PORT,
    'baudrate': SERIAL_BAUDRATE,
    'temp_min': TEMP_MIN,
    'temp_max': TEMP_MAX,
    'bpm_min': BPM_MIN,
    'bpm_max': BPM_MAX,
    'update_interval': UPDATE_INTERVAL_MS
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
    'arduino_ctx': arduino_ctx,
    'save_config': save_config,
    'save_session_record': save_session_record,
    'list_patient_records': list_patient_records,
    'list_patient_sessions': list_patient_sessions,
    'create_patient': create_patient,
    'update_patient': update_patient,
    'delete_patient': delete_patient,
    'update_patient_summary': update_patient_summary,
    'compute_avg_bpm': _compute_avg_bpm,
    'ArduinoReader': ArduinoReader,
})


if __name__ == '__main__':
    # Cargar configuración
    load_config()
    # Inicializar base de datos
    init_db()
    
    # Inicializar Arduino
    init_arduino(config)

    # Iniciar thread para leer datos
    reader_thread = threading.Thread(target=read_arduino_loop, args=(config, session_state), daemon=True)
    reader_thread.start()
    
    # Iniciar servidor Flask
    app.run(debug=FLASK_DEBUG, host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)

