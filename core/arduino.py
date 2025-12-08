from .arduino_serial import ArduinoReader
import time

# Configuración por defecto de Arduino (puede ser sobrescrita)
DEFAULT_ARDUINO_CONFIG = {
    'port': None,
    'baudrate': 115200,
    'temp_min': 20.0,
    'temp_max': 37.0,
    'bpm_min': 60,
    'bpm_max': 100,
    'update_interval': 500  # ms
}

# Contexto global de Arduino
arduino_ctx = {'reader': None}

# Datos más recientes del sensor
latest_data = {
    'temperature': 0.0,
    'bpm': 0,
    'status': 'Desconectado',
    'alert': False,
    'raw_line': None
}

def init_arduino(config=None):
    """Inicializa la conexión con Arduino

    Args:
        config (dict): Configuración de Arduino (puerto, baudrate, etc.)
    """
    global arduino_ctx
    if config is None:
        config = DEFAULT_ARDUINO_CONFIG

    try:
        reader = ArduinoReader(baudrate=config.get('baudrate', DEFAULT_ARDUINO_CONFIG['baudrate']))
        port = config.get('port')

        if reader.connect(port=port):
            arduino_ctx['reader'] = reader
            print(f"Arduino conectado correctamente en {reader.port}")
            return True
        else:
            print("No se pudo conectar con Arduino")
            return False
    except Exception as e:
        print(f"Error al inicializar Arduino: {e}")
        return False

def read_arduino_loop(config=None, session_state=None):
    """Loop en segundo plano para leer datos de Arduino

    Args:
        config (dict): Configuración para determinar alertas
        session_state (dict): Estado de sesión del paciente para acumular datos
    """
    global latest_data

    if config is None:
        config = DEFAULT_ARDUINO_CONFIG

    while True:
        reader = arduino_ctx.get('reader')
        if reader and reader.is_connected():
            try:
                data = reader.read_data()
                if data:
                    latest_data = data

                    # Determinar si hay alerta según configuración
                    temp = data.get('temperature', 0)
                    bpm = data.get('bpm', 0)
                    latest_data['alert'] = (
                        temp > config.get('temp_max', DEFAULT_ARDUINO_CONFIG['temp_max']) or
                        temp < config.get('temp_min', DEFAULT_ARDUINO_CONFIG['temp_min']) or
                        bpm > config.get('bpm_max', DEFAULT_ARDUINO_CONFIG['bpm_max']) or
                        (bpm < config.get('bpm_min', DEFAULT_ARDUINO_CONFIG['bpm_min']) and bpm > 0)
                    )

                    # Traza básica para ver lo que llega por serial
                    raw_line = data.get('raw_line')
                    if raw_line:
                        print(f"[SERIAL] {raw_line}")
                    # Traza compacta de valores, incluso si son 0 (coloreado azul)
                    temp_val = data.get('temperature', 0)
                    bpm_val = data.get('bpm', 0)
                    status_val = data.get('status', 'Desconectado')
                    blue = "\033[94m"
                    reset = "\033[0m"
                    print(
                        f"[DATA] Temp={blue}{temp_val:.1f}°C{reset} "
                        f"BPM={blue}{bpm_val}{reset} "
                        f"Status={status_val}"
                    )

                    # Si hay sesión activa, acumular datos
                    if session_state and session_state.get('active'):
                        _accumulate_session_data(data, session_state)

            except Exception as e:
                print(f"Error leyendo datos: {e}")
                latest_data['status'] = 'Error de lectura'
        else:
            latest_data['status'] = 'Desconectado'

        time.sleep(0.5)

def _accumulate_session_data(data, session_state):
    """Acumula datos de sensores durante una sesión activa

    Args:
        data (dict): Datos del sensor
        session_state (dict): Estado de la sesión del paciente
    """
    bpm = data.get('bpm')
    temp = data.get('temperature')

    if bpm and bpm > 0:
        session_state['bpm_sum'] += bpm
        session_state['bpm_count'] += 1

        if session_state['min_bpm'] is None or bpm < session_state['min_bpm']:
            session_state['min_bpm'] = bpm
        if session_state['max_bpm'] is None or bpm > session_state['max_bpm']:
            session_state['max_bpm'] = bpm

    if temp is not None:
        session_state['last_temp'] = temp

def disconnect_arduino():
    """Desconecta Arduino si está conectado"""
    global arduino_ctx
    reader = arduino_ctx.get('reader')
    if reader:
        try:
            reader.disconnect()
            arduino_ctx['reader'] = None
            latest_data['status'] = 'Desconectado'
            print("Arduino desconectado")
        except Exception as e:
            print(f"Error al desconectar Arduino: {e}")

def is_arduino_connected():
    """Verifica si Arduino está conectado"""
    reader = arduino_ctx.get('reader')
    return reader is not None and reader.is_connected()

def get_arduino_port():
    """Obtiene el puerto actual de Arduino"""
    reader = arduino_ctx.get('reader')
    return reader.port if reader and reader.is_connected() else None

def reconnect_arduino(config=None):
    """Reintenta la conexión con Arduino

    Args:
        config (dict): Nueva configuración para reconectar

    Returns:
        bool: True si la reconexión fue exitosa
    """
    disconnect_arduino()
    return init_arduino(config)

def get_sensor_data():
    """Obtiene los datos más recientes del sensor"""
    return latest_data.copy()

def reset_sensor_data():
    """Resetea los datos del sensor a valores por defecto"""
    global latest_data
    latest_data = {
        'temperature': 0.0,
        'bpm': 0,
        'status': 'Desconectado',
        'alert': False
    }
