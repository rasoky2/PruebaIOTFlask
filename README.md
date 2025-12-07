# Monitor Cardíaco con Flask y Arduino

Sistema de monitoreo de signos vitales que conecta Arduino (ESP32) con una aplicación Flask para visualización en tiempo real y alertas.

## Características

- Registro de paciente previo al monitoreo
- Lectura de temperatura corporal mediante sensor MLX90614
- Detección de pulso cardíaco (BPM) mediante sensor analógico
- Interfaz web en tiempo real con gráficos estilo monitor médico
- Gráficos de pulso cardíaco (estilo ECG) y temperatura en tiempo real
- Sistema de alertas con sonido cuando los valores están fuera de rango
- Botón manual para reproducir alerta
- Configuración mediante archivos (sin panel web)
- Guarda al cierre de sesión: temperatura final y promedio de BPM en SQLite (`patients.db`)

## Requisitos

### Hardware
- ESP32 (o Arduino compatible)
- Sensor de temperatura MLX90614
- Sensor de pulso cardíaco (analógico)
- Buzzer (opcional, para alertas en Arduino)
- Cables y resistencias según necesidad

### Software
- Python 3.8+
- Arduino IDE
- Librerías Arduino:
  - `Adafruit_MLX90614`
  - `Wire`

## Instalación

1. Instalar dependencias de Python:
```bash
pip install -r requirements.txt
```

2. Subir el código ESP32:
   - **IMPORTANTE**: Usar `arduino_serial_flask.ino` (NO `heart.ino`)
   - `heart.ino` es para WiFi/Ubidots (no compatible con Flask)
   - `arduino_serial_flask.ino` es para comunicación Serial con Flask
   - Abrir `arduino_serial_flask.ino` en Arduino IDE
   - Instalar librería `Adafruit MLX90614` desde el gestor de librerías
   - Seleccionar la placa: **ESP32 Dev Module** (o tu modelo de ESP32)
   - Subir el código

3. Conectar Arduino al puerto USB

## Uso

1. Iniciar el servidor Flask:
```bash
python app.py
```

2. Abrir el navegador en: `http://localhost:5000`

3. Colocar el dedo en el sensor de pulso

4. Registrar paciente en la interfaz (nombre obligatorio) y luego iniciar registro

5. La interfaz mostrará:
   - Temperatura y pulso cardíaco en tiempo real
   - Gráficos de monitoreo (estilo monitor médico)
   - Estado de conexión
   - Estadísticas (promedio BPM, temperatura máxima)
   - Alertas automáticas cuando los valores están fuera de rango

## Rangos Normales

- **Temperatura**: 20°C - 37°C
- **Pulso**: 60 - 100 BPM

Cuando los valores excedan estos rangos, se activará automáticamente una alerta sonora.

## Estructura del Proyecto

```
.
├── app.py                 # Servidor Flask principal
├── arduino_serial.py      # Comunicación serial con ESP32
├── arduino_serial_flask.ino  # Código ESP32 para Flask (USAR ESTE)
├── heart.ino              # Código ESP32 para WiFi/Ubidots (NO USAR con Flask)
├── config.py              # Configuración manual Python (opcional)
├── config.example.py      # Ejemplo de configuración
├── requirements.txt       # Dependencias Python
├── config.json            # Configuración persistente (se crea automáticamente)
├── templates/
│   └── index.html         # Interfaz web
├── static/
│   └── js/
│       ├── app.js         # Lógica del frontend
│       └── config.const.js # Configuración manual JavaScript
└── README.md
```

## Configuración Manual

### Configuración Python (`config.py`)

Puedes crear un archivo `config.py` para configurar manualmente el sistema:

```python
# Puerto COM fijo (None = detección automática)
SERIAL_PORT = 'COM3'  # o None para auto-detección

# Velocidad de comunicación
SERIAL_BAUDRATE = 115200

# Umbrales de alerta
TEMP_MIN = 20.0
TEMP_MAX = 37.0
BPM_MIN = 60
BPM_MAX = 100

# Configuración del servidor Flask
FLASK_PORT = 5000
FLASK_HOST = '0.0.0.0'
FLASK_DEBUG = True
```

Copia `config.example.py` como `config.py` y modifica los valores según necesites.

### Configuración JavaScript (`static/js/config.const.js`)

Para configurar el frontend, edita `static/js/config.const.js`:

```javascript
const FRONTEND_CONFIG = {
    updateInterval: 500,        // Intervalo de actualización (ms)
    enableAlertSound: true,     // Habilitar sonido de alerta
    alertSoundFrequency: 800,   // Frecuencia del sonido (Hz)
    // ... más opciones
};
```

## Notas

- **IMPORTANTE**: Este proyecto usa `arduino_serial_flask.ino` (ESP32 con Serial)
- `heart.ino` es un código diferente que usa WiFi y Ubidots (no compatible con Flask)
- El sistema busca automáticamente el puerto COM donde está conectado ESP32
- **Configuración**: Toda la configuración se realiza mediante archivos:
  - `config.py` - Configuración del backend (puerto, umbrales, servidor Flask)
  - `static/js/config.const.js` - Configuración del frontend (intervalos, alertas)
- Las alertas se activan automáticamente cuando los valores están fuera de rango
- El botón "Activar Alerta" permite reproducir manualmente el sonido de alerta
- Los gráficos muestran hasta 50 puntos de datos (configurable en `config.const.js`)
- Al cerrar sesión de paciente se guarda en `patients.db` la temperatura final y el promedio de BPM

