/**
 * Archivo de configuración manual para el Frontend
 * Modifica estos valores según tus necesidades
 * 
 * NOTA: Estos valores se pueden sobrescribir desde la interfaz web
 */

const FRONTEND_CONFIG = {
    // ============================================
    // CONFIGURACIÓN DE ACTUALIZACIÓN
    // ============================================

    // Intervalo de actualización de datos (milisegundos)
    // Valores recomendados: 100-5000 ms
    updateInterval: 500,

    // Número máximo de puntos en los gráficos
    maxChartDataPoints: 50,

    // ============================================
    // CONFIGURACIÓN DE ALERTAS
    // ============================================

    // Habilitar sonido de alerta
    enableAlertSound: true,

    // Frecuencia del sonido de alerta (Hz)
    alertSoundFrequency: 800,

    // Duración del sonido de alerta (ms)
    alertSoundDuration: 500,

    // Intervalo entre alertas sonoras cuando hay alarma activa (ms)
    alertSoundInterval: 1000,

    // ============================================
    // CONFIGURACIÓN DE INTERFAZ
    // ============================================

    // Mostrar notificaciones toast
    showNotifications: true,

    // Duración de las notificaciones (ms)
    notificationDuration: 3000,

    // Auto-refrescar lista de puertos al abrir configuración
    autoRefreshPorts: true,

    // ============================================
    // CONFIGURACIÓN DE VALORES POR DEFECTO
    // ============================================

    // Umbrales por defecto (se pueden cambiar desde la interfaz)
    defaultThresholds: {
        tempMin: 20,
        tempMax: 37,
        bpmMin: 60,
        bpmMax: 100
    },

    // Baudrate por defecto
    defaultBaudrate: 115200,


    // ============================================
    // CONFIGURACIÓN DE VALIDACIÓN
    // ============================================

    // Rangos válidos para configuración
    validRanges: {
        tempMin: { min: 0, max: 50 },
        tempMax: { min: 0, max: 50 },
        bpmMin: { min: 30, max: 200 },
        bpmMax: { min: 30, max: 200 },
        updateInterval: { min: 100, max: 5000 },
        baudrate: [9600, 19200, 38400, 57600, 115200]
    }
};

// Exportar configuración (si se usa módulos)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FRONTEND_CONFIG;
}
