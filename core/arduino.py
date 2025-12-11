import time

# Configuración por defecto de Límites
DEFAULT_ARDUINO_CONFIG = {
    'temp_min': 20.0,
    'temp_max': 37.0,
    'bpm_min': 60,
    'bpm_max': 100
}

STATUS_WAITING = 'Esperando datos...'
STATUS_CONNECTED = 'Conectado (WiFi)'
STATUS_DISCONNECTED = 'Desconectado (Timeout)'

# Datos más recientes del sensor (Recibidos por HTTP)
latest_data = {
    'temperature': 0.0,
    'bpm': 0,
    'status': STATUS_WAITING,
    'alert': False,
    'last_update': 0
}

def monitor_sensor_timeout(config=None):
    """Loop en segundo plano para verificar desconexión por timeout"""
    global latest_data

    if config is None:
        config = DEFAULT_ARDUINO_CONFIG

    while True:
        # Check for timeout if no update received recently
        last_ts = latest_data.get('last_update', 0)
        
        # Si han pasado más de 10 segundos sin datos HTTP
        if time.time() - last_ts > 10.0:
             if latest_data.get('status') != STATUS_DISCONNECTED:
                 latest_data['status'] = STATUS_DISCONNECTED
                 latest_data['bpm'] = 0
                 latest_data['temperature'] = 0.0

        # Determinar si hay alerta según configuración (Revisar periódicamente)
        temp = latest_data.get('temperature', 0)
        bpm = latest_data.get('bpm', 0)
        
        # Solo evaluar alertas si tenemos datos recientes
        if latest_data.get('status') not in [STATUS_DISCONNECTED, STATUS_WAITING]:
            latest_data['alert'] = (
                temp > config.get('temp_max', DEFAULT_ARDUINO_CONFIG['temp_max']) or
                temp < config.get('temp_min', DEFAULT_ARDUINO_CONFIG['temp_min']) or
                bpm > config.get('bpm_max', DEFAULT_ARDUINO_CONFIG['bpm_max']) or
                (bpm < config.get('bpm_min', DEFAULT_ARDUINO_CONFIG['bpm_min']) and bpm > 0)
            )

        time.sleep(1.0)

def accumulate_session_data(data, session_state):
    """Acumula datos de sensores durante una sesión activa
    Args:
        data (dict): Datos del sensor
        session_state (dict): Estado de la sesión del paciente
    """
    bpm = data.get('bpm')
    temp = data.get('temperature')

    # Solo acumular si los datos son válidos y recientes
    if bpm and bpm > 0:
        session_state['bpm_sum'] += bpm
        session_state['bpm_count'] += 1

        if session_state['min_bpm'] is None or bpm < session_state['min_bpm']:
            session_state['min_bpm'] = bpm
        if session_state['max_bpm'] is None or bpm > session_state['max_bpm']:
            session_state['max_bpm'] = bpm

    if temp is not None and temp > 0:
        session_state['last_temp'] = temp
