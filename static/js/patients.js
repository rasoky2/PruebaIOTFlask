let historyCache = [];
let editRecordId = null;
let sessionsCache = [];
let pendingDeleteId = null;

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

function renderHistory(records) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-sm text-gray-500">Sin registros</td></tr>';
        return;
    }
    const rows = records.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.name || '--'}</td>
            <td>${r.identifier || '--'}</td>
            <td>${r.age ?? '--'}</td>
            <td>${r.last_temp != null ? Number(r.last_temp).toFixed(1) : '--'}</td>
            <td>${r.avg_bpm != null ? Number(r.avg_bpm).toFixed(1) : '--'}</td>
            <td>${r.created_at || '--'}</td>
            <td class="flex gap-2">
                <button class="btn btn-ghost btn-xs text-info" data-action="edit" data-id="${r.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-ghost btn-xs text-error" data-action="delete" data-id="${r.id}"><i class="fas fa-trash"></i></button>
                <button class="btn btn-ghost btn-xs text-accent" data-action="sessions" data-id="${r.id}"><i class="fas fa-chart-line"></i></button>
                <button class="btn btn-ghost btn-xs text-primary" data-action="details" data-id="${r.id}"><i class="fas fa-eye"></i></button>
            </td>
        </tr>
    `).join('');
    tbody.innerHTML = rows;
}

function renderSessions(records) {
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-sm text-gray-500">Sin sesiones</td></tr>';
        return;
    }
    const rows = records.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.avg_bpm != null ? Number(r.avg_bpm).toFixed(1) : '--'}</td>
            <td>${r.min_bpm != null ? Number(r.min_bpm).toFixed(1) : '--'}</td>
            <td>${r.max_bpm != null ? Number(r.max_bpm).toFixed(1) : '--'}</td>
            <td>${r.last_temp != null ? Number(r.last_temp).toFixed(1) : '--'} °C</td>
        </tr>
    `).join('');
    tbody.innerHTML = rows;
}

async function loadHistory() {
    try {
        const res = await fetch('/api/patient/history?limit=50');
        const data = await res.json();
        if (data.success) {
            historyCache = data.records || [];
            renderHistory(historyCache);
        } else {
            renderHistory([]);
        }
    } catch (e) {
        console.error('Error cargando historial', e);
        renderHistory([]);
    }
}

async function loadPatientDetails(patientId) {
    try {
        // Cargar sesiones del paciente para estadísticas
        const sessionsRes = await fetch(`/api/patient/${patientId}/sessions?limit=100`);
        const sessionsData = await sessionsRes.json();

        if (sessionsData.success && sessionsData.sessions) {
            const sessions = sessionsData.sessions;

            // Calcular estadísticas
            const stats = calculatePatientStats(sessions);

            // Renderizar detalles
            renderPatientDetails(patientId, sessions, stats);
        } else {
            renderPatientDetails(patientId, [], {});
        }
    } catch (e) {
        console.error('Error cargando detalles del paciente', e);
        renderPatientDetails(patientId, [], {});
    }
}

function openPatientDetailsFromQuery(patientId) {
    if (!patientId) return;
    const exists = historyCache.some(r => String(r.id) === String(patientId));
    if (!exists) {
        showToast('Paciente no encontrado en la lista', 'warning');
        return;
    }
    showDetailsModal(patientId);
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
    loadPatientDetails(patientId);
    modal.showModal();
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

    const patient = historyCache.find(p => String(p.id) === String(patientId));

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
            <h4 class="text-lg font-semibold mb-3">Información del Paciente</h4>
            <div class="bg-base-100 rounded-lg p-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><strong>Nombre:</strong> ${patient?.name || 'N/A'}</div>
                    <div><strong>ID:</strong> ${patient?.identifier || 'N/A'}</div>
                    <div><strong>Edad:</strong> ${patient?.age || 'N/A'}</div>
                    <div><strong>Última Temp:</strong> ${patient?.last_temp ? patient.last_temp.toFixed(1) + '°C' : 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="mb-6">
            <h4 class="text-lg font-semibold mb-3">Estadísticas Detalladas</h4>
            <div class="bg-base-100 rounded-lg p-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><strong>BPM Mínimo:</strong> ${stats.minBpmOverall}</div>
                    <div><strong>BPM Máximo:</strong> ${stats.maxBpmOverall}</div>
                    <div><strong>Sesiones con BPM:</strong> ${sessions.filter(s => s.avg_bpm != null).length}</div>
                    <div><strong>Sesiones con Temp:</strong> ${sessions.filter(s => s.last_temp != null).length}</div>
                </div>
            </div>
        </div>

        <div>
            <h4 class="text-lg font-semibold mb-3">Últimas 10 Sesiones</h4>
            <div class="overflow-x-auto">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>BPM Prom</th>
                            <th>BPM Min</th>
                            <th>BPM Max</th>
                            <th>Temperatura</th>
                            <th>Duración</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.slice(0, 10).map(session => `
                            <tr>
                                <td>${new Date(session.created_at || session.start_at * 1000).toLocaleString()}</td>
                                <td>${session.avg_bpm != null ? session.avg_bpm.toFixed(1) : '--'}</td>
                                <td>${session.min_bpm != null ? session.min_bpm : '--'}</td>
                                <td>${session.max_bpm != null ? session.max_bpm : '--'}</td>
                                <td>${session.last_temp != null ? session.last_temp.toFixed(1) + '°C' : '--'}</td>
                                <td>${session.start_at && session.end_at ? formatTime(session.end_at - session.start_at) : '--'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = statsHtml;
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

async function loadSessions(pid) {
    try {
        const res = await fetch(`/api/patient/${pid}/sessions?limit=50`);
        const data = await res.json();
        if (data.success) {
            sessionsCache = data.sessions || [];
            renderSessions(sessionsCache);
        } else {
            renderSessions([]);
        }
    } catch (e) {
        console.error('Error cargando sesiones', e);
        renderSessions([]);
    }
}

function fillRecordForm(record) {
    editRecordId = record.id;
    document.getElementById('recordName').value = record.name || '';
    document.getElementById('recordId').value = record.identifier || '';
    document.getElementById('recordAge').value = record.age ?? '';
    document.getElementById('recordSaveBtn').innerHTML = '<i class="fas fa-save"></i> Actualizar Paciente';
    document.getElementById('recordCancelBtn').hidden = false;
    document.getElementById('recordNewBtn').hidden = true;
}

function resetRecordForm() {
    editRecordId = null;
    document.getElementById('recordName').value = '';
    document.getElementById('recordId').value = '';
    document.getElementById('recordAge').value = '';
    document.getElementById('recordSaveBtn').innerHTML = '<i class="fas fa-save"></i> Crear Paciente';
    document.getElementById('recordCancelBtn').hidden = true;
    document.getElementById('recordNewBtn').hidden = false;
}

function newRecordForm() {
    resetRecordForm();
    document.getElementById('recordName').focus();
}

async function saveRecord() {
    const idInput = document.getElementById('recordId');
    const ageInput = document.getElementById('recordAge');
    const name = document.getElementById('recordName').value.trim();
    const identifier = idInput.value.trim();
    const ageValue = ageInput.value;
    const age = ageValue ? parseInt(ageValue, 10) : null;

    if (!name) {
        showToast('Nombre requerido', 'warning');
        return;
    }

    if (identifier && !/^\d{1,8}$/.test(identifier)) {
        showToast('El DNI/ID debe tener hasta 8 dígitos', 'warning');
        return;
    }

    if (age != null && (Number.isNaN(age) || age < 0 || age > 999)) {
        showToast('Edad inválida (0-999)', 'warning');
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

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const initialPatientId = params.get('patient');
    const detailsModal = document.getElementById('detailsModal');
    const confirmDeleteModal = document.getElementById('confirmDeleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    loadHistory().then(() => {
        if (initialPatientId) {
            openPatientDetailsFromQuery(initialPatientId);
        }
    });

    if (confirmDeleteBtn && confirmDeleteModal) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (pendingDeleteId) {
                await performDelete(pendingDeleteId);
                pendingDeleteId = null;
            }
            confirmDeleteModal.close();
        });
    }

    document.getElementById('recordSaveBtn').addEventListener('click', saveRecord);
    document.getElementById('recordNewBtn').addEventListener('click', newRecordForm);
    document.getElementById('recordCancelBtn').addEventListener('click', resetRecordForm);
    document.getElementById('historyReloadBtn').addEventListener('click', loadHistory);
    document.getElementById('sessionsReloadBtn').addEventListener('click', () => {
        const pid = document.getElementById('sessionsModal').dataset.pid;
        if (pid) loadSessions(pid);
    });
    document.getElementById('historyTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!action || !id) return;
        if (action === 'edit') {
            const record = historyCache.find(r => String(r.id) === String(id));
            if (record) {
                fillRecordForm(record);
                document.getElementById('drawer-patients').checked = true;
            }
        } else if (action === 'delete') {
            requestDelete(id);
        } else if (action === 'sessions') {
            const modal = document.getElementById('sessionsModal');
            const title = document.getElementById('sessionsTitle');
            if (modal && title) {
                modal.dataset.pid = id;
                title.textContent = `Sesiones de paciente #${id}`;
                loadSessions(id);
                modal.showModal();
            }
        } else if (action === 'details') {
            showDetailsModal(id);
        }
    });
});
