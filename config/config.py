"""
Archivo de configuración manual para el Monitor Cardíaco
Modifica estos valores según tus necesidades
"""


# ============================================
# UMBRALES DE ALERTA
# ============================================

# Temperatura mínima (°C) - Alerta si está por debajo
TEMP_MIN = 20.0

# Temperatura máxima (°C) - Alerta si está por encima
TEMP_MAX = 37.0

# BPM mínimo - Alerta si está por debajo (y mayor a 0)
BPM_MIN = 60

# BPM máximo - Alerta si está por encima
BPM_MAX = 100


# ============================================
# CONFIGURACIÓN DE INTERFAZ WEB
# ============================================

# Intervalo de actualización de datos en la interfaz (milisegundos)
# Valores recomendados: 100-5000 ms
UPDATE_INTERVAL_MS = 500

# Puerto del servidor Flask
FLASK_PORT = 5000

# Host del servidor Flask
# '0.0.0.0' = accesible desde cualquier IP
# '127.0.0.1' = solo localhost
FLASK_HOST = '0.0.0.0'

# Modo debug de Flask (True/False)
FLASK_DEBUG = True



# Archivo donde se guarda la configuración persistente
CONFIG_FILE = 'config.json'
