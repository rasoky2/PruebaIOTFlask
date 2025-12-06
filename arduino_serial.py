import serial
import serial.tools.list_ports
import time
import re

# Intentar importar patrones de configuración manual
try:
    from config import ARDUINO_PORT_PATTERNS
except ImportError:
    ARDUINO_PORT_PATTERNS = ['ARDUINO', 'USB', 'SERIAL', 'CH340', 'CP210', 'ESP32', 'FTDI']

class ArduinoReader:
    def __init__(self, baudrate=115200, timeout=1):
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial_connection = None
        self.port = None
        
    def find_arduino_port(self):
        """Busca el puerto COM donde está conectado Arduino"""
        ports = serial.tools.list_ports.comports()
        for port in ports:
            # Buscar por descripción común de Arduino/ESP32
            port_desc = port.description.upper()
            if any(keyword in port_desc for keyword in ARDUINO_PORT_PATTERNS):
                return port.device
        return None
    
    def connect(self, port=None):
        """Conecta con Arduino"""
        try:
            if port is None:
                port = self.find_arduino_port()
            
            if port is None:
                print("No se encontró ningún puerto Arduino")
                return False
            
            self.port = port
            self.serial_connection = serial.Serial(
                port=port,
                baudrate=self.baudrate,
                timeout=self.timeout
            )
            time.sleep(2)  # Esperar a que Arduino se inicialice
            print(f"Conectado a {port}")
            return True
        except Exception as e:
            print(f"Error al conectar: {e}")
            return False
    
    def is_connected(self):
        """Verifica si hay conexión activa"""
        return self.serial_connection is not None and self.serial_connection.is_open
    
    def read_data(self):
        """Lee y parsea los datos del Arduino"""
        if not self.is_connected():
            return None
        
        try:
            if self.serial_connection.in_waiting > 0:
                line = self.serial_connection.readline().decode('utf-8', errors='ignore').strip()
                
                # Buscar patrones en la línea
                # Formato esperado: "BPM: 75 (Normal) | Temp: 36.5°C | Buzzer: OFF"
                bpm_match = re.search(r'BPM:\s*(\d+)', line)
                temp_match = re.search(r'Temp:\s*([\d.]+)', line)
                status_match = re.search(r'\(([^)]+)\)', line)
                
                if bpm_match or temp_match:
                    data = {
                        'temperature': float(temp_match.group(1)) if temp_match else 0.0,
                        'bpm': int(bpm_match.group(1)) if bpm_match else 0,
                        'status': status_match.group(1) if status_match else 'Leyendo...',
                        'timestamp': time.time()
                    }
                    return data
        except Exception as e:
            print(f"Error leyendo línea: {e}")
        
        return None
    
    def disconnect(self):
        """Cierra la conexión"""
        if self.serial_connection and self.serial_connection.is_open:
            self.serial_connection.close()
            print("Conexión cerrada")

