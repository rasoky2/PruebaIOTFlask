from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from arduino_serial import ArduinoReader
import threading
import time
import json
import os

# Intentar importar configuración manual
try:
    from config import (
        SERIAL_PORT, SERIAL_BAUDRATE, SERIAL_TIMEOUT,
        TEMP_MIN, TEMP_MAX, BPM_MIN, BPM_MAX,
        UPDATE_INTERVAL_MS, FLASK_PORT, FLASK_HOST, FLASK_DEBUG,
        CONFIG_FILE as CONFIG_FILE_NAME
    )
    CONFIG_FILE = CONFIG_FILE_NAME
    print("Configuración manual cargada desde config.py")
except ImportError:
    # Valores por defecto si no existe config.py
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
    print("Usando configuración por defecto (crea config.py para personalizar)")

app = Flask(__name__)
CORS(app)

# Instancia global del lector Arduino
arduino_reader = None
latest_data = {
    'temperature': 0.0,
    'bpm': 0,
    'status': 'Desconectado',
    'alert': False
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

def init_arduino():
    """Inicializa la conexión con Arduino"""
    global arduino_reader
    try:
        arduino_reader = ArduinoReader(baudrate=config['baudrate'])
        port = config.get('port')
        if arduino_reader.connect(port=port):
            print(f"Arduino conectado correctamente en {arduino_reader.port}")
        else:
            print("No se pudo conectar con Arduino")
    except Exception as e:
        print(f"Error al inicializar Arduino: {e}")

def read_arduino_loop():
    """Loop en segundo plano para leer datos de Arduino"""
    global latest_data
    while True:
        if arduino_reader and arduino_reader.is_connected():
            try:
                data = arduino_reader.read_data()
                if data:
                    latest_data = data
                    # Determinar si hay alerta según configuración
                    temp = data.get('temperature', 0)
                    bpm = data.get('bpm', 0)
                    latest_data['alert'] = (
                        temp > config['temp_max'] or temp < config['temp_min'] or 
                        bpm > config['bpm_max'] or (bpm < config['bpm_min'] and bpm > 0)
                    )
            except Exception as e:
                print(f"Error leyendo datos: {e}")
                latest_data['status'] = 'Error de lectura'
        else:
            latest_data['status'] = 'Desconectado'
        time.sleep(0.5)

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/data')
def get_data():
    """Endpoint para obtener los últimos datos"""
    return jsonify(latest_data)

@app.route('/api/alert/trigger')
def trigger_alert():
    """Endpoint para activar alerta manualmente"""
    return jsonify({'success': True, 'message': 'Alerta activada'})

@app.route('/api/ports', methods=['GET'])
def list_ports():
    """Lista todos los puertos COM disponibles"""
    try:
        import serial.tools.list_ports
        ports = []
        for port in serial.tools.list_ports.comports():
            ports.append({
                'device': port.device,
                'description': port.description,
                'manufacturer': port.manufacturer or 'Desconocido',
                'vid': port.vid,
                'pid': port.pid
            })
        return jsonify({'success': True, 'ports': ports})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    """Obtiene la configuración actual"""
    global arduino_reader
    current_port = arduino_reader.port if arduino_reader and arduino_reader.is_connected() else None
    return jsonify({
        'success': True,
        'config': {
            **config,
            'current_port': current_port
        }
    })

@app.route('/api/config', methods=['POST'])
def update_config():
    """Actualiza la configuración"""
    global config, arduino_reader
    try:
        data = request.get_json()
        
        # Actualizar configuración
        if 'port' in data:
            config['port'] = data['port']
        if 'baudrate' in data:
            config['baudrate'] = int(data['baudrate'])
        if 'temp_min' in data:
            config['temp_min'] = float(data['temp_min'])
        if 'temp_max' in data:
            config['temp_max'] = float(data['temp_max'])
        if 'bpm_min' in data:
            config['bpm_min'] = int(data['bpm_min'])
        if 'bpm_max' in data:
            config['bpm_max'] = int(data['bpm_max'])
        if 'update_interval' in data:
            config['update_interval'] = int(data['update_interval'])
        
        save_config()
        
        # Reconectar si cambió el puerto o baudrate
        if 'port' in data or 'baudrate' in data:
            if arduino_reader:
                arduino_reader.disconnect()
            arduino_reader = ArduinoReader(baudrate=config['baudrate'])
            if arduino_reader.connect(port=config.get('port')):
                return jsonify({'success': True, 'message': 'Configuración guardada y reconectado'})
            else:
                return jsonify({'success': False, 'message': 'Configuración guardada pero no se pudo conectar'})
        
        return jsonify({'success': True, 'message': 'Configuración guardada'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/connect', methods=['POST'])
def connect_port():
    """Conecta a un puerto específico"""
    global arduino_reader
    try:
        data = request.get_json()
        port = data.get('port')
        baudrate = int(data.get('baudrate', config['baudrate']))
        
        if arduino_reader:
            arduino_reader.disconnect()
        
        arduino_reader = ArduinoReader(baudrate=baudrate)
        if arduino_reader.connect(port=port):
            config['port'] = port
            config['baudrate'] = baudrate
            save_config()
            return jsonify({'success': True, 'message': f'Conectado a {port}'})
        else:
            return jsonify({'success': False, 'message': 'No se pudo conectar al puerto'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # Cargar configuración
    load_config()
    
    # Inicializar Arduino
    init_arduino()
    
    # Iniciar thread para leer datos
    reader_thread = threading.Thread(target=read_arduino_loop, daemon=True)
    reader_thread.start()
    
    # Iniciar servidor Flask
    app.run(debug=FLASK_DEBUG, host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)

