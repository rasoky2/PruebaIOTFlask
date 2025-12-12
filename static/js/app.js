let alertSound = null;
let isAlertActive = false;
let updateInterval = null;
const state = window.AppState || {};

// Gráficos
let pulseChart = null;
let tempChart = null;
const maxDataPoints = (typeof FRONTEND_CONFIG !== 'undefined' && FRONTEND_CONFIG.maxChartDataPoints)
    ? FRONTEND_CONFIG.maxChartDataPoints
    : 50;

let fetchTimer = null;
let errorStreak = 0;
let baseInterval = 500;
const maxBackoff = 4000;

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

function showToast(message, type = 'info') {
    const alertClass = {
        success: 'alert-success',
        error: 'alert-error',
        warning: 'alert-warning',
        info: 'alert-info'
    }[type] || 'alert-info';

    const el = document.createElement('div');
    el.className = `alert ${alertClass} fixed top-4 right-4 z-50 shadow-lg max-w-md`;
    el.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function resetCharts() {
    state.pulseData = [];
    state.tempData = [];
    state.timeLabels = [];
    state.pulseSum = 0;
    state.tempMax = 0;
    if (pulseChart) {
        pulseChart.data.labels = [];
        pulseChart.data.datasets[0].data = [];
        pulseChart.update('none');
    }
    if (tempChart) {
        tempChart.data.labels = [];
        tempChart.data.datasets[0].data = [];
        tempChart.update('none');
    }
    document.getElementById('currentBPM').textContent = '--';
    document.getElementById('avgBPM').textContent = '--';
    document.getElementById('currentTemp').textContent = '--';
    document.getElementById('maxTemp').textContent = '--';
}

function refreshSessionUI() {
    const dataSection = document.getElementById('dataSection');
    const noSession = document.getElementById('noSession');
    const startBtn = document.getElementById('startSessionBtn');
    const endBtn = document.getElementById('endSessionBtn');
    const sessionInfo = document.getElementById('sessionInfo');

    if (state.sessionActive && state.currentPatient) {
        dataSection.classList.remove('hidden');
        noSession.classList.add('hidden');
        startBtn.disabled = true;
        endBtn.disabled = false;
        sessionInfo.textContent = ``;
    } else if (state.allowViewWithoutSession) {
        dataSection.classList.remove('hidden');
        noSession.classList.add('hidden');
        startBtn.disabled = false;
        endBtn.disabled = true;
        sessionInfo.textContent = 'Modo solo visualización';
    } else {
        dataSection.classList.add('hidden');
        noSession.classList.remove('hidden');
        startBtn.disabled = false;
        endBtn.disabled = true;
        sessionInfo.textContent = 'Sin paciente en sesión';
    }
}

function renderHistory(records) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-sm text-gray-500">Sin registros</td></tr>';
        return;
    }
    const rows = records.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.name || '--'}</td>
            <td>${r.identifier || '--'}</td>
            <td>${r.age ?? '--'}</td>
            <td>${r.last_temp != null ? r.last_temp.toFixed(1) : '--'}</td>
            <td>${r.avg_bpm != null ? r.avg_bpm.toFixed(1) : '--'}</td>
            <td>${r.created_at || '--'}</td>
            <td class="flex gap-2">
                <button class="btn btn-ghost btn-xs text-primary" data-action="edit" data-id="${r.id}" title="Editar paciente"><i class="fas fa-edit"></i></button>
                <button class="btn btn-ghost btn-xs text-error" data-action="delete" data-id="${r.id}" title="Eliminar paciente"><i class="fas fa-trash"></i></button>
                <button class="btn btn-ghost btn-xs text-primary" data-action="view" data-id="${r.id}" title="Ver estadísticas e historial"><i class="fas fa-search"></i></button>
            </td>
        </tr>
    `).join('');
    tbody.innerHTML = rows;
}

async function loadHistory() {
    try {
        const res = await fetch('/api/patient/history?limit=50');
        const data = await res.json();
        if (data.success) {
            state.historyCache = data.records || [];
            renderHistory(state.historyCache);
        } else {
            renderHistory([]);
        }
    } catch (e) {
        console.error('Error cargando historial', e);
        renderHistory([]);
    }
}

function formatTime(seconds) {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

function calculatePatientStats(sessions) {
    if (!sessions || sessions.length === 0) {
        return {
            totalSessions: 0,
            avgBpmOverall: 0,
            minBpmOverall: 0,
            maxBpmOverall: 0,
            avgTempOverall: 0,
            totalMonitoringTime: 0
        };
    }

    let totalBpm = 0;
    let totalTemp = 0;
    let validBpmCount = 0;
    let validTempCount = 0;
    let minBpm = Infinity;
    let maxBpm = -Infinity;
    let totalTime = 0;

    sessions.forEach(session => {
        if (session.avg_bpm != null) {
            totalBpm += session.avg_bpm;
            validBpmCount++;
        }
        if (session.min_bpm != null && session.min_bpm < minBpm) minBpm = session.min_bpm;
        if (session.max_bpm != null && session.max_bpm > maxBpm) maxBpm = session.max_bpm;
        if (session.last_temp != null) {
            totalTemp += session.last_temp;
            validTempCount++;
        }
        if (session.start_at && session.end_at) {
            totalTime += (session.end_at - session.start_at);
        }
    });

    return {
        totalSessions: sessions.length,
        avgBpmOverall: validBpmCount > 0 ? (totalBpm / validBpmCount).toFixed(1) : 0,
        minBpmOverall: minBpm !== Infinity ? minBpm : 0,
        maxBpmOverall: maxBpm !== -Infinity ? maxBpm : 0,
        avgTempOverall: validTempCount > 0 ? (totalTemp / validTempCount).toFixed(1) : 0,
        totalMonitoringTime: totalTime
    };
}

function renderPatientDetails(patientId, sessions, stats) {
    const container = document.getElementById('patientDetailsContent');
    if (!container) return;
    const patient = state.historyCache.find(p => String(p.id) === String(patientId));
    const statsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="stat bg-base-100 rounded-lg p-4">
                <div class="stat-title">Total Sesiones</div>
                <div class="stat-value text-primary">${stats.totalSessions}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg p-4">
                <div class="stat-title">BPM Promedio</div>
                <div class="stat-value text-secondary">${stats.avgBpmOverall}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg p-4">
                <div class="stat-title">Temperatura Promedio</div>
                <div class="stat-value text-accent">${stats.avgTempOverall}°C</div>
            </div>
            <div class="stat bg-base-100 rounded-lg p-4">
                <div class="stat-title">Tiempo Total</div>
                <div class="stat-value text-info">${formatTime(stats.totalMonitoringTime)}</div>
            </div>
        </div>

        <div class="mb-6">
            <h4 class="text-lg font-semibold mb-3">Información y Estadísticas</h4>
            <div class="bg-base-100 rounded-lg p-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><strong>Nombre:</strong> ${patient?.name || 'N/A'}</div>
                    <div><strong>ID:</strong> ${patient?.identifier || 'N/A'}</div>
                    <div><strong>Edad:</strong> ${patient?.age || 'N/A'}</div>
                    <div><strong>Última Temp:</strong> ${patient?.last_temp ? patient.last_temp.toFixed(1) + '°C' : 'N/A'}</div>
                    
                    <div class="col-span-2 md:col-span-4 divider my-0"></div>

                    <div><strong>BPM Mínimo:</strong> ${stats.minBpmOverall}</div>
                    <div><strong>BPM Máximo:</strong> ${stats.maxBpmOverall}</div>
                    <div><strong>Sesiones con BPM:</strong> ${sessions.filter(s => s.avg_bpm != null).length}</div>
                    <div><strong>Sesiones con Temp:</strong> ${sessions.filter(s => s.last_temp != null).length}</div>
                </div>
            </div>
        </div>

        <div>
            <h4 class="text-lg font-semibold mb-3">Historial de Sesiones</h4>
            <div class="overflow-x-auto max-h-[400px]">
                <table class="table table-sm table-pin-rows">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>BPM Prom</th>
                            <th>BPM Min/Max</th>
                            <th>Temperatura</th>
                            <th>Duración</th>
                            <th>Evaluación</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map(session => {
        const bpmHigh = session.max_bpm > 100;
        const bpmLow = session.min_bpm < 60 && session.min_bpm > 0;
        const tempHigh = session.last_temp > 37.5;
        const isAbnormal = bpmHigh || bpmLow || tempHigh;
        const statusBadge = isAbnormal
            ? '<span class="badge badge-error badge-xs">Atención</span>'
            : '<span class="badge badge-success badge-xs">Normal</span>';

        return `
                            <tr>
                                <td>${new Date(session.created_at || session.start_at * 1000).toLocaleString()}</td>
                                <td class="font-mono">${session.avg_bpm != null ? session.avg_bpm.toFixed(1) : '--'}</td>
                                <td class="text-xs">
                                    <span class="${bpmLow ? 'text-error font-bold' : ''}">${session.min_bpm ?? '-'}</span> / 
                                    <span class="${bpmHigh ? 'text-error font-bold' : ''}">${session.max_bpm ?? '-'}</span>
                                </td>
                                <td class="${tempHigh ? 'text-error font-bold' : ''}">${session.last_temp != null ? session.last_temp.toFixed(1) + '°C' : '--'}</td>
                                <td>${session.start_at && session.end_at ? formatTime(session.end_at - session.start_at) : '--'}</td>
                                <td>${session.avg_bpm ? statusBadge : '--'}</td>
                            </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    container.innerHTML = statsHtml;
}

async function loadPatientDetails(patientId) {
    const modal = document.getElementById('detailsModal');
    const content = document.getElementById('patientDetailsContent');
    if (!modal || !content) return;
    try {
        const sessionsRes = await fetch(`/api/patient/${patientId}/sessions?limit=100`);
        const sessionsData = await sessionsRes.json();
        const sessions = sessionsData.success && sessionsData.sessions ? sessionsData.sessions : [];
        const stats = calculatePatientStats(sessions);
        renderPatientDetails(patientId, sessions, stats);
    } catch (e) {
        console.error('Error cargando detalles del paciente', e);
        content.innerHTML = '<p class="text-sm text-error">Error cargando detalles</p>';
    }
}

function showDetailsModal(patientId) {
    const modal = document.getElementById('detailsModal');
    const title = document.getElementById('detailsTitle');
    const content = document.getElementById('patientDetailsContent');
    if (!modal || !title || !content) return;
    title.textContent = `Detalles del paciente #${patientId}`;
    content.innerHTML = `
        <div class="text-center">
            <div class="loading loading-spinner loading-lg text-primary"></div>
            <p class="mt-2">Cargando detalles...</p>
        </div>
    `;
    modal.showModal();
    loadPatientDetails(patientId);
}

function fillRecordForm(record) {
    document.getElementById('recordName').value = record.name || '';
    document.getElementById('recordId').value = record.identifier || '';
    document.getElementById('recordAge').value = record.age ?? '';
}

function resetRecordForm() {
    editRecordId = null;
    document.getElementById('recordName').value = '';
    document.getElementById('recordId').value = '';
    document.getElementById('recordAge').value = '';
    document.getElementById('recordSaveBtn').innerHTML = '<i class="fas fa-save"></i> Guardar';
    document.getElementById('recordCancelBtn').classList.add('hidden');
}

async function saveRecord() {
    const name = document.getElementById('recordName').value.trim();
    const identifier = document.getElementById('recordId').value.trim();
    const ageValue = document.getElementById('recordAge').value;
    const age = ageValue ? parseInt(ageValue, 10) : null;

    if (!name) {
        showToast('Nombre requerido', 'warning');
        return;
    }

    const payload = { name, identifier, age };

    try {
        if (editRecordId) {
            const res = await fetch(`/api/patient/${editRecordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'No se pudo actualizar');
            showToast('Registro actualizado', 'success');
        } else {
            const res = await fetch('/api/patient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'No se pudo crear');
            showToast('Registro creado', 'success');
        }
        resetRecordForm();
        loadHistory();
        loadPatientsBasic(); // Updates the main dropdown
    } catch (e) {
        console.error('Error guardando registro', e);
        showToast('Error guardando registro', 'error');
    }
}

async function performDelete(id) {
    try {
        const res = await fetch(`/api/patient/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'No se pudo eliminar');
        showToast('Registro eliminado', 'success');
        if (editRecordId === id) resetRecordForm();
        loadHistory();
        loadPatientsBasic(); // Updates the main dropdown
    } catch (e) {
        console.error('Error eliminando registro', e);
        showToast('Error eliminando registro', 'error');
    }
}

function requestDelete(id) {
    pendingDeleteId = id;
    const modal = document.getElementById('confirmDeleteModal');
    const message = document.getElementById('deleteMessage');
    if (message) {
        const record = historyCache.find(r => String(r.id) === String(id));
        const name = record?.name || `ID ${id}`;
        message.textContent = `¿Eliminar el paciente ${name}?`;
    }
    if (modal) modal.showModal();
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
    updateStatus(data.status || 'Conectado', data.status !== 'Desconectado');

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
}

function initCharts() {
    // Gráfico de Pulso Cardíaco (estilo ECG)
    const pulseCtx = document.getElementById('pulseChart').getContext('2d');
    pulseChart = new Chart(pulseCtx, {
        type: 'line',
        data: {
            labels: state.timeLabels,
            datasets: [{
                label: 'BPM',
                data: state.pulseData,
                borderColor: '#1d4ed8',
                backgroundColor: 'rgba(29, 78, 216, 0.08)',
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
                        color: 'rgba(29, 78, 216, 0.08)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#1d4ed8',
                        font: {
                            size: 10
                        },
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(29, 78, 216, 0.08)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#1d4ed8',
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
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.12)',
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
                        color: 'rgba(14, 165, 233, 0.12)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#0ea5e9',
                        font: {
                            size: 10
                        },
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(14, 165, 233, 0.12)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#0ea5e9',
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
    state.pulseData.push(bpmValue);

    // Sincronizar timeLabels solo para el gráfico de pulso
    if (state.pulseData.length !== state.timeLabels.length) {
        state.timeLabels.push(timeStr);
    } else {
        state.timeLabels[state.timeLabels.length - 1] = timeStr;
    }

    if (state.pulseData.length > maxDataPoints) {
        state.pulseData.shift();
        state.timeLabels.shift();
    }

    // Calcular promedio de los valores válidos (> 0)
    const validBPMs = state.pulseData.filter(v => v > 0);
    const avg = validBPMs.length > 0
        ? Math.round(validBPMs.reduce((a, b) => a + b, 0) / validBPMs.length)
        : 0;

    document.getElementById('currentBPM').textContent = bpmValue || '--';
    document.getElementById('avgBPM').textContent = avg || '--';

    pulseChart.data.labels = [...state.timeLabels];
    pulseChart.data.datasets[0].data = [...state.pulseData];
    pulseChart.update('none');
}

function updateTempChart(temp) {
    if (!tempChart) return;

    const tempValue = temp || 0;
    state.tempData.push(tempValue);

    if (state.tempData.length > maxDataPoints) {
        state.tempData.shift();
    }

    // Sincronizar con timeLabels del gráfico de pulso
    if (tempChart.data.labels.length !== state.timeLabels.length) {
        tempChart.data.labels = [...state.timeLabels];
    }

    // Asegurar que tempData tenga la misma longitud que timeLabels
    while (state.tempData.length < state.timeLabels.length) {
        state.tempData.unshift(tempValue);
    }
    while (state.tempData.length > state.timeLabels.length) {
        state.tempData.shift();
    }

    tempChart.data.datasets[0].data = [...state.tempData];

    if (tempValue > state.tempMax) {
        state.tempMax = tempValue;
    }

    document.getElementById('currentTemp').textContent = tempValue ? tempValue.toFixed(1) : '--';
    document.getElementById('maxTemp').textContent = state.tempMax ? state.tempMax.toFixed(1) : '--';

    tempChart.update('none');
}

function activateAlert() {
    isAlertActive = true;
    // const button = document.getElementById('alertButton'); // Element removed
    // const message = document.getElementById('alertMessage'); // Element removed

    // Play sound only
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
    // const button = document.getElementById('alertButton'); // Element removed
    // const message = document.getElementById('alertMessage'); // Element removed
}

function scheduleFetch(delay = baseInterval) {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchData, delay);
}

async function fetchData() {
    if (!liveUpdatesEnabled) {
        return;
    }
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        errorStreak = 0;
        updateData(data);
        scheduleFetch(baseInterval);
    } catch (error) {
        console.error('Error fetching data:', error);
        updateStatus('Desconectado', false);
        errorStreak += 1;
        const nextDelay = Math.min(baseInterval * (2 ** errorStreak), maxBackoff);
        scheduleFetch(nextDelay);
    }
}



function startUpdates() {
    baseInterval = (typeof FRONTEND_CONFIG !== 'undefined' && FRONTEND_CONFIG.updateInterval)
        ? FRONTEND_CONFIG.updateInterval
        : 500;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (fetchTimer) clearTimeout(fetchTimer);
            updateStatus('Pausado (fondo)', false);
        } else if (liveUpdatesEnabled) {
            errorStreak = 0;
            scheduleFetch(0);
        }
    });
}

function updateRefreshInterval(interval) {
    baseInterval = interval;
    scheduleFetch(baseInterval);
}

window.updateRefreshInterval = updateRefreshInterval;

function stopUpdates() {
    if (fetchTimer) {
        clearTimeout(fetchTimer);
        fetchTimer = null;
    }
}

function enableLiveUpdates() {
    if (state.liveUpdatesEnabled) return;
    state.liveUpdatesEnabled = true;
    errorStreak = 0;
    scheduleFetch(0);
}

function disableLiveUpdates() {
    state.liveUpdatesEnabled = false;
    stopUpdates();
    updateStatus('En espera', false);
}

async function loadSession() {
    try {
        const res = await fetch('/api/patient/current');
        const data = await res.json();
        if (data.success) {
            state.sessionActive = data.active;
            state.currentPatient = data.patient;
            if (state.sessionActive) {
                enableLiveUpdates();
            } else {
                disableLiveUpdates();
            }
            refreshSessionUI();
        }
    } catch (e) {
        console.error('Error cargando sesión', e);
    }
}

async function loadPatientsBasic() {
    const select = document.getElementById('patientSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Cargando...</option>';
    try {
        const res = await fetch('/api/patient/list?limit=100');
        const data = await res.json();
        if (data.success) {
            state.patientList = data.patients || [];
            if (!state.patientList.length) {
                select.innerHTML = '<option value="">Sin pacientes, crea uno en la gestión</option>';
                return;
            }
            select.innerHTML = '<option value="">Selecciona un paciente...</option>';
            state.patientList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name}${p.identifier ? ' | ' + p.identifier : ''}${p.age ? ' | ' + p.age + ' años' : ''}`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="">Error al cargar</option>';
        }
    } catch (e) {
        console.error('Error cargando pacientes', e);
        select.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function startSessionFromSelect() {
    const select = document.getElementById('patientSelect');
    if (!select) return;
    const id = select.value;
    if (!id) {
        showToast('Selecciona un paciente', 'warning');
        return;
    }
    const patient = state.patientList.find(p => String(p.id) === String(id));
    if (!patient) {
        showToast('Paciente no encontrado', 'error');
        return;
    }
    document.getElementById('patientName').value = patient.name || '';
    document.getElementById('patientId').value = patient.identifier || '';
    document.getElementById('patientAge').value = patient.age ?? '';
    await startSession();
}

async function startSession() {
    const name = document.getElementById('patientName').value.trim();
    const identifier = document.getElementById('patientId').value.trim();
    const ageValue = document.getElementById('patientAge').value;
    const age = ageValue ? parseInt(ageValue, 10) : null;
    const patientSelect = document.getElementById('patientSelect');
    const patientId = patientSelect ? patientSelect.value : null;

    if (!name) {
        showToast('Selecciona un paciente', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/patient/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, identifier, age, patient_id: patientId || null })
        });
        const data = await res.json();
        if (data.success) {
            state.sessionActive = true;
            state.currentPatient = data.patient;
            resetCharts();
            refreshSessionUI();
            enableLiveUpdates();
            showToast('Sesión iniciada', 'success');
        } else {
            showToast(data.error || 'No se pudo iniciar', 'error');
        }
    } catch (e) {
        console.error('Error iniciando sesión', e);
        showToast('Error iniciando sesión', 'error');
    }
}

async function endSession() {
    if (!state.sessionActive) return;
    try {
        const res = await fetch('/api/patient/end', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Sesión guardada. Promedio BPM: ${data.avg_bpm || '--'}, Temp: ${data.last_temp || '--'}`, 'success');
            state.sessionActive = false;
            state.currentPatient = null;
            resetCharts();
            refreshSessionUI();
            disableLiveUpdates();
            deactivateAlert();
            loadHistory();
        } else {
            showToast(data.error || 'No se pudo cerrar sesión', 'error');
        }
    } catch (e) {
        console.error('Error cerrando sesión', e);
        showToast('Error cerrando sesión', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    refreshSessionUI();
    loadSession();
    loadHistory();
    loadPatientsBasic();
    startUpdates();

    // Botones y eventos principales (verifica existencia por si no está la sección)
    const startBtn = document.getElementById('startSessionBtn');
    const endBtn = document.getElementById('endSessionBtn');
    const historyReloadBtn = document.getElementById('historyReloadBtn');
    const recordSaveBtn = document.getElementById('recordSaveBtn');
    const recordCancelBtn = document.getElementById('recordCancelBtn');
    const historyTable = document.getElementById('historyTableBody');
    const recordsModal = document.getElementById('recordsModal');
    const openRecordsModal = document.getElementById('openRecordsModal');
    const detailsModal = document.getElementById('detailsModal');
    const confirmDeleteModal = document.getElementById('confirmDeleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const chooseRegisterBtn = document.getElementById('chooseRegisterBtn');
    const chooseViewBtn = document.getElementById('chooseViewBtn');
    const modeModal = document.getElementById('modeModal');
    const patientSelect = document.getElementById('patientSelect');
    const useSelectedBtn = document.getElementById('useSelectedBtn');
    const refreshPatientsBtn = document.getElementById('refreshPatientsBtn');

    if (startBtn) startBtn.addEventListener('click', startSession);
    if (endBtn) endBtn.addEventListener('click', endSession);
    if (historyReloadBtn) historyReloadBtn.addEventListener('click', () => { loadHistory(); loadPatientsBasic(); });
    if (recordSaveBtn) recordSaveBtn.addEventListener('click', saveRecord);
    if (recordCancelBtn) recordCancelBtn.addEventListener('click', resetRecordForm);
    if (openRecordsModal && recordsModal) {
        openRecordsModal.addEventListener('click', () => recordsModal.showModal());
    }
    if (confirmDeleteBtn && confirmDeleteModal) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (pendingDeleteId) {
                await performDelete(pendingDeleteId);
                pendingDeleteId = null;
            }
            confirmDeleteModal.close();
        });
        confirmDeleteModal.addEventListener('close', () => {
            pendingDeleteId = null;
        });
    }
    if (useSelectedBtn) useSelectedBtn.addEventListener('click', startSessionFromSelect);
    if (refreshPatientsBtn) refreshPatientsBtn.addEventListener('click', loadPatientsBasic);
    if (historyTable) {
        historyTable.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            const action = btn?.dataset.action;
            const id = btn?.dataset.id;
            if (!action || !id) return;
            if (action === 'edit') {
                const record = historyCache.find(r => String(r.id) === String(id));
                if (record) {
                    editRecordId = id;
                    fillRecordForm(record);
                    document.getElementById('recordSaveBtn').innerHTML = '<i class="fas fa-save"></i> Actualizar';
                    if (recordCancelBtn) recordCancelBtn.classList.remove('hidden');
                    if (recordsModal) recordsModal.showModal();
                }
            } else if (action === 'delete') {
                requestDelete(id);
            } else if (action === 'view') {
                showDetailsModal(id);
            }
        });
    }

    // Modal inicial eliminado: usar selector para elegir paciente.
});

window.addEventListener('beforeunload', stopUpdates);
