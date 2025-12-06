let alertSound = null;
let isAlertActive = false;
let updateInterval = null;

// Gráficos
let pulseChart = null;
let tempChart = null;
const maxDataPoints = (typeof FRONTEND_CONFIG !== 'undefined' && FRONTEND_CONFIG.maxChartDataPoints) 
    ? FRONTEND_CONFIG.maxChartDataPoints 
    : 50;
let pulseData = [];
let tempData = [];
let timeLabels = [];
let pulseSum = 0;
let tempMax = 0;

function initAudio() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return audioContext;
}

function playAlertSound() {
    if (!alertSound) {
        alertSound = initAudio();
    }
    
    const oscillator = alertSound.createOscillator();
    const gainNode = alertSound.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(alertSound.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, alertSound.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, alertSound.currentTime + 0.5);
    
    oscillator.start(alertSound.currentTime);
    oscillator.stop(alertSound.currentTime + 0.5);
}

function updateStatus(status, connected) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    
    statusText.textContent = status;
    if (connected) {
        statusDot.className = 'w-3 h-3 rounded-full bg-success animate-pulse-dot';
        statusText.className = 'font-medium text-success';
    } else {
        statusDot.className = 'w-3 h-3 rounded-full bg-error animate-pulse-dot';
        statusText.className = 'font-medium text-error';
    }
}

function updateData(data) {
    const tempElement = document.getElementById('temperature');
    const bpmElement = document.getElementById('bpm');
    const tempCard = document.getElementById('tempCard');
    const bpmCard = document.getElementById('bpmCard');
    
    if (data.temperature !== undefined) {
        tempElement.textContent = data.temperature.toFixed(1);
        updateTempChart(data.temperature);
    }
    
    if (data.bpm !== undefined) {
        const bpmValue = data.bpm || 0;
        bpmElement.textContent = bpmValue || '--';
        updatePulseChart(bpmValue);
    }
    
    const hasAlert = data.alert || false;
    
    if (hasAlert) {
        tempCard.className = 'card bg-error text-error-content shadow-lg animate-shake';
        bpmCard.className = 'card bg-error text-error-content shadow-lg animate-shake';
        
        if (!isAlertActive) {
            activateAlert();
        }
    } else {
        tempCard.className = 'card bg-base-200 shadow-lg';
        bpmCard.className = 'card bg-base-200 shadow-lg';
        deactivateAlert();
    }
    
    updateStatus(data.status || 'Conectado', data.status !== 'Desconectado');
}

function initCharts() {
    // Gráfico de Pulso Cardíaco (estilo ECG)
    const pulseCtx = document.getElementById('pulseChart').getContext('2d');
    pulseChart = new Chart(pulseCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'BPM',
                data: pulseData,
                borderColor: '#00ff41',
                backgroundColor: 'rgba(0, 255, 65, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#00ff41',
                    bodyColor: '#00ff41',
                    borderColor: '#00ff41',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00ff41',
                        font: {
                            size: 10
                        },
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00ff41',
                        font: {
                            size: 10
                        }
                    },
                    min: 0,
                    max: 200
                }
            }
        }
    });

    // Gráfico de Temperatura
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperatura (°C)',
                data: [],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#00d4ff',
                    bodyColor: '#00d4ff',
                    borderColor: '#00d4ff',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        color: 'rgba(0, 212, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00d4ff',
                        font: {
                            size: 10
                        },
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(0, 212, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#00d4ff',
                        font: {
                            size: 10
                        }
                    },
                    min: 0,
                    max: 50
                }
            }
        }
    });
}

function updatePulseChart(bpm) {
    if (!pulseChart) return;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const bpmValue = bpm || 0;
    pulseData.push(bpmValue);
    
    // Sincronizar timeLabels solo para el gráfico de pulso
    if (pulseData.length !== timeLabels.length) {
        timeLabels.push(timeStr);
    } else {
        timeLabels[timeLabels.length - 1] = timeStr;
    }
    
    if (pulseData.length > maxDataPoints) {
        pulseData.shift();
        timeLabels.shift();
    }
    
    // Calcular promedio de los valores válidos (> 0)
    const validBPMs = pulseData.filter(v => v > 0);
    const avg = validBPMs.length > 0 
        ? Math.round(validBPMs.reduce((a, b) => a + b, 0) / validBPMs.length) 
        : 0;
    
    document.getElementById('currentBPM').textContent = bpmValue || '--';
    document.getElementById('avgBPM').textContent = avg || '--';
    
    pulseChart.data.labels = [...timeLabels];
    pulseChart.data.datasets[0].data = [...pulseData];
    pulseChart.update('none');
}

function updateTempChart(temp) {
    if (!tempChart) return;
    
    const tempValue = temp || 0;
    tempData.push(tempValue);
    
    if (tempData.length > maxDataPoints) {
        tempData.shift();
    }
    
    // Sincronizar con timeLabels del gráfico de pulso
    if (tempChart.data.labels.length !== timeLabels.length) {
        tempChart.data.labels = [...timeLabels];
    }
    
    // Asegurar que tempData tenga la misma longitud que timeLabels
    while (tempData.length < timeLabels.length) {
        tempData.unshift(tempValue);
    }
    while (tempData.length > timeLabels.length) {
        tempData.shift();
    }
    
    tempChart.data.datasets[0].data = [...tempData];
    
    if (tempValue > tempMax) {
        tempMax = tempValue;
    }
    
    document.getElementById('currentTemp').textContent = tempValue ? tempValue.toFixed(1) : '--';
    document.getElementById('maxTemp').textContent = tempMax ? tempMax.toFixed(1) : '--';
    
    tempChart.update('none');
}

function activateAlert() {
    isAlertActive = true;
    const button = document.getElementById('alertButton');
    const message = document.getElementById('alertMessage');
    
    button.className = 'btn btn-error btn-lg gap-2 animate-pulse';
    button.disabled = false;
    message.innerHTML = '<div class="alert alert-error shadow-lg"><i class="fas fa-exclamation-triangle mr-2"></i><span>ALERTA: Valores fuera de rango normal!</span></div>';
    
    playAlertSound();
    
    const alertInterval = setInterval(() => {
        if (isAlertActive) {
            playAlertSound();
        } else {
            clearInterval(alertInterval);
        }
    }, 1000);
}

function deactivateAlert() {
    isAlertActive = false;
    const button = document.getElementById('alertButton');
    const message = document.getElementById('alertMessage');
    
    button.className = 'btn btn-primary btn-lg gap-2';
    message.className = 'mt-6 min-h-[60px] flex items-center justify-center';
    message.innerHTML = '';
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        updateData(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        updateStatus('Error de conexión', false);
    }
}

function setupAlertButton() {
    const button = document.getElementById('alertButton');
    button.addEventListener('click', () => {
        if (isAlertActive) {
            playAlertSound();
        }
    });
}

function startUpdates() {
    fetchData();
    // Usar intervalo de configuración manual si está disponible
    const interval = (typeof FRONTEND_CONFIG !== 'undefined' && FRONTEND_CONFIG.updateInterval) 
        ? FRONTEND_CONFIG.updateInterval 
        : 500;
    updateInterval = setInterval(fetchData, interval);
}

function updateRefreshInterval(interval) {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateInterval = setInterval(fetchData, interval);
}

window.updateRefreshInterval = updateRefreshInterval;

function stopUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupAlertButton();
    startUpdates();
});

window.addEventListener('beforeunload', stopUpdates);
