// Estado centralizado (simple) para exponer variables de app.js sin reescribir todo.
// Define propiedades en window con getters/setters hacia un objeto interno.
// Así podemos eliminar declaraciones duplicadas en app.js sin romper referencias existentes.

const __state = {
    sessionActive: false,
    currentPatient: null,
    allowViewWithoutSession: false,
    patientList: [],
    liveUpdatesEnabled: false,
    historyCache: [],
    editRecordId: null,
    pendingDeleteId: null,
    pulseData: [],
    tempData: [],
    timeLabels: [],
    pulseSum: 0,
    tempMax: 0
};

function defineStateProp(name) {
    Object.defineProperty(window, name, {
        get() { return __state[name]; },
        set(val) { __state[name] = val; },
        configurable: false
    });
}

[
    'sessionActive',
    'currentPatient',
    'allowViewWithoutSession',
    'patientList',
    'liveUpdatesEnabled',
    'historyCache',
    'editRecordId',
    'pendingDeleteId',
    'pulseData',
    'tempData',
    'timeLabels',
    'pulseSum',
    'tempMax'
].forEach(defineStateProp);

window.AppState = new Proxy(__state, {
    get(_, prop) { return __state[prop]; },
    set(_, prop, val) { __state[prop] = val; return true; }
});
