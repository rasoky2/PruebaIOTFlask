let alertSound = null;
let isAlertActive = false;
let updateInterval = null;

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
    }
    
    if (data.bpm !== undefined) {
        bpmElement.textContent = data.bpm || '--';
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
    setupAlertButton();
    startUpdates();
});

window.addEventListener('beforeunload', stopUpdates);

