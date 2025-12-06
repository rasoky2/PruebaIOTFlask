const config_modal = document.getElementById('config_modal');
let currentTab = 'connection';

function switchTab(tabName) {
    currentTab = tabName;
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('tab-active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    event.target.classList.add('tab-active');
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

async function loadPorts() {
    try {
        const response = await fetch('/api/ports');
        const data = await response.json();
        
        const select = document.getElementById('portSelect');
        select.innerHTML = '<option value="">Seleccionar puerto...</option>';
        
        if (data.success && data.ports.length > 0) {
            data.ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.device;
                option.textContent = `${port.device} - ${port.description || port.manufacturer || 'Desconocido'}`;
                select.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No se encontraron puertos';
            select.appendChild(option);
        }
    } catch (error) {
        console.error('Error cargando puertos:', error);
        showNotification('Error al cargar puertos', 'error');
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.success) {
            const cfg = data.config;
            
            document.getElementById('currentPort').textContent = cfg.current_port || 'Ninguno';
            document.getElementById('baudrateSelect').value = cfg.baudrate || 115200;
            document.getElementById('tempMin').value = cfg.temp_min || 20.0;
            document.getElementById('tempMax').value = cfg.temp_max || 37.0;
            document.getElementById('bpmMin').value = cfg.bpm_min || 60;
            document.getElementById('bpmMax').value = cfg.bpm_max || 100;
            document.getElementById('updateInterval').value = cfg.update_interval || 500;
            
            if (cfg.port) {
                document.getElementById('portSelect').value = cfg.port;
            }
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

async function connectPort() {
    const port = document.getElementById('portSelect').value;
    const baudrate = parseInt(document.getElementById('baudrateSelect').value);
    
    if (!port) {
        showNotification('Selecciona un puerto', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ port, baudrate })
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification(data.message, 'success');
            document.getElementById('currentPort').textContent = port;
            loadConfig();
        } else {
            showNotification(data.message || 'Error al conectar', 'error');
        }
    } catch (error) {
        console.error('Error conectando:', error);
        showNotification('Error al conectar', 'error');
    }
}

async function disconnectPort() {
    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ port: null })
        });
        
        const data = await response.json();
        showNotification('Desconectado', 'info');
        document.getElementById('currentPort').textContent = 'Ninguno';
    } catch (error) {
        console.error('Error desconectando:', error);
    }
}

async function saveThresholds() {
    const config = {
        temp_min: parseFloat(document.getElementById('tempMin').value),
        temp_max: parseFloat(document.getElementById('tempMax').value),
        bpm_min: parseInt(document.getElementById('bpmMin').value),
        bpm_max: parseInt(document.getElementById('bpmMax').value)
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Umbrales guardados', 'success');
        } else {
            showNotification('Error al guardar', 'error');
        }
    } catch (error) {
        console.error('Error guardando umbrales:', error);
        showNotification('Error al guardar', 'error');
    }
}

async function saveAdvanced() {
    const config = {
        update_interval: parseInt(document.getElementById('updateInterval').value)
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Configuración guardada', 'success');
            const interval = config.update_interval || 500;
            if (window.updateRefreshInterval) {
                window.updateRefreshInterval(interval);
            }
        } else {
            showNotification('Error al guardar', 'error');
        }
    } catch (error) {
        console.error('Error guardando configuración:', error);
        showNotification('Error al guardar', 'error');
    }
}

function showNotification(message, type = 'info') {
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-error',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[type] || 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} fixed top-4 right-4 z-50 shadow-lg max-w-md`;
    notification.innerHTML = `<span>${message}</span>`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    loadPorts();
    loadConfig();
    
    document.getElementById('refreshPorts').addEventListener('click', loadPorts);
    document.getElementById('connectBtn').addEventListener('click', connectPort);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectPort);
    document.getElementById('saveThresholds').addEventListener('click', saveThresholds);
    document.getElementById('saveAdvanced').addEventListener('click', saveAdvanced);
    
    config_modal.addEventListener('close', () => {
        loadConfig();
    });
});

