

import { showNotification } from './notificaciones.js';

const RELAY_ELEMENTS = {
    1: 'esp8266-top',
    2: 'esp8266-bottom',
    3: 'esp8266-right'
};

const BUTTON_COOLDOWN_MS = 5000;

let relayStates = { 1: 'on', 2: 'on', 3: 'on' };
let espConnected = false;
const buttonCooldowns = {};
let socket = null;

// Momento (epoch ms) en que termina la ventana de bloqueo por Fault, o null si no
// hay ninguna en curso. Viene del servidor (relay_status.faultWindowEndsAt) en vez
// de detectarse localmente por la transición off->on: así, si la página se recarga
// o el WS se reconecta a mitad de la espera, el primer relay_status que llega ya
// trae el dato real y el bloqueo se reconstruye - antes este estado vivía solo en
// memoria del navegador y un refresh lo hacía desaparecer sin que la ventana real
// hubiera terminado, dando a entender que todo estaba normal cuando no era así.
let faultWindowEndsAt = null;
let faultBannerEl = null;
let faultBannerDescartado = false; // el usuario cerró el cartel a mano para ESTA ventana

function updateRelayVisual(elementId, state) {
    const block = document.getElementById('block-' + elementId);
    const img = document.getElementById(elementId);
    const status = document.getElementById('status-' + elementId);
    if (!block || !img || !status) return;

    block.classList.remove('on', 'off', 'disconnected');
    status.classList.remove('on', 'off', 'disconnected');
    block.classList.add(state);
    status.classList.add(state);
    img.classList.toggle('relay-disconnected', state === 'disconnected'); // filtro gris (SCADA.CSS)

    if (state === 'on') {
        img.src = 'images/Relay_ON.png';
        status.textContent = 'ON';
    } else if (state === 'off') {
        img.src = 'images/Relay_OFF.png';
        status.textContent = 'OFF';
    } else {
        img.src = 'images/Relay_OFF.png';
        status.textContent = 'Desconectado';
    }
}

// El inversor no tiene comando propio: su ícono se deriva del estado de Relay 3,
// salvo mientras dura la ventana de bloqueo por Fault tras encender Relay 3
// (faultWindowEndsAt en el futuro) - ahí se fuerza FAULT aunque el relé ya esté
// "on", para que el ícono acompañe al cartel de esos ~320s.
// (El código viejo tenía un tercer caso "OFF" para cuando R1/R2/R3 están todos
// apagados, pero nunca se ejecutaba: el primer "if" ya cubre cualquier R3 apagado.)
function updateInverterState() {
    const img = document.getElementById('goodwe-inverter');
    const status = document.getElementById('status-goodwe-inverter');
    const block = document.getElementById('block-goodwe-inverter');
    if (!img || !status || !block) return;

    const enVentanaFault = !!faultWindowEndsAt && faultWindowEndsAt > Date.now();
    const relay3On = relayStates[3] === 'on' && !enVentanaFault;
    block.classList.remove('on', 'fault');
    img.classList.remove('on', 'fault');

    if (relay3On) {
        img.src = 'images/Inverter_ON.png';
        status.textContent = 'ON';
        block.classList.add('on');
        img.classList.add('on');
    } else {
        img.src = 'images/Inverter_FAULT.png';
        status.textContent = 'FAULT';
        block.classList.add('fault');
        img.classList.add('fault');
    }
}

function setButtonEnabled(elementId, enabled) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.toggle('disabled', !enabled);
    el.style.opacity = enabled ? '1' : '0.7';
    el.style.pointerEvents = enabled ? 'auto' : 'none';
}

function refreshButtonEnabled(relayNum) {
    setButtonEnabled(RELAY_ELEMENTS[relayNum], espConnected && !buttonCooldowns[relayNum]);
}

function refreshAllButtons() {
    Object.keys(RELAY_ELEMENTS).forEach(num => refreshButtonEnabled(Number(num)));
}

// --- Interlocks: mismas reglas que relay.controller.js, acá solo para UX ---

function checkEmergencyManeuver(relayNum, action) {
    if (action !== 'relay_off') return { ok: true };
    const r1 = relayStates[1] === 'on', r2 = relayStates[2] === 'on', r3 = relayStates[3] === 'on';
    if (!r3) return { ok: true };
    if (relayNum === 2 && !r1 && r2) return { ok: false, message: 'Debes primero desconectar la Alterna' };
    if (relayNum === 1 && !r2 && r1) return { ok: false, message: 'Debes primero desconectar la Alterna' };
    return { ok: true };
}

function checkCommissioningManeuver(relayNum, action) {
    if (action !== 'relay_on') return { ok: true };
    if (relayNum === 3 && !(relayStates[1] === 'on' || relayStates[2] === 'on')) {
        return { ok: false, message: 'No se puede conectar el Inversor a la Alterna sin previamente la Alimentación de Continua' };
    }
    return { ok: true };
}

function checkDisconnectionManeuver(relayNum, action) {
    if (action !== 'relay_off') return { ok: true };
    const r1 = relayStates[1] === 'on', r2 = relayStates[2] === 'on', r3 = relayStates[3] === 'on';
    if (!r3 && !r1 && relayNum === 2) return { ok: false, message: 'No está permitido apagar el Inversor' };
    if (!r2 && relayNum === 1) return { ok: false, message: 'No está permitido apagar el Inversor' };
    return { ok: true };
}

function checkInterlocks(relayNum, action) {
    for (const check of [checkEmergencyManeuver, checkDisconnectionManeuver, checkCommissioningManeuver]) {
        const result = check(relayNum, action);
        if (!result.ok) return result;
    }
    return { ok: true };
}

// --- Cartel de bloqueo por Fault (Relay 3 ON, ventana de faultWindowEndsAt) ---
// A diferencia del resto de las notificaciones (notificaciones.js), este cartel no
// arranca su propio cronómetro: se reconstruye cada segundo a partir de
// faultWindowEndsAt (dato del servidor), así que sobrevive a un refresh de la
// página o a una reconexión del WS sin perder la cuenta real.

function ocultarBannerFault() {
    if (!faultBannerEl) return;
    const el = faultBannerEl;
    faultBannerEl = null;
    el.classList.add('notif-out');
    setTimeout(() => el.remove(), 300);
}

function crearBannerFault() {
    const notif = document.createElement('div');
    notif.className = 'progress-notif';
    notif.innerHTML = `
        <button type="button" class="progress-notif-close" aria-label="Cerrar">&times;</button>
        <div class="progress-notif-body">
            <div class="notif-spinner"></div>
            <div class="progress-notif-title"></div>
        </div>
    `;
    notif.querySelector('.progress-notif-close').addEventListener('click', () => {
        // Solo oculta el cartel de la pantalla (para que no estorbe, sobre todo en
        // celular): la ventana de Fault real sigue corriendo en el servidor, esto
        // no la cancela ni destraba el ícono antes de tiempo.
        faultBannerDescartado = true;
        ocultarBannerFault();
    });
    document.body.appendChild(notif);
    return notif;
}

// Se llama cada vez que llega un relay_status (incluido el primero tras conectar)
// y también una vez por segundo, para que la cuenta regresiva se vea fluida sin
// depender de la frecuencia de mensajes del WS.
function actualizarBannerFault() {
    const activo = !!faultWindowEndsAt && faultWindowEndsAt > Date.now();
    if (!activo) {
        ocultarBannerFault();
        return;
    }
    if (faultBannerDescartado) return;
    if (!faultBannerEl) faultBannerEl = crearBannerFault();
    const restante = Math.max(0, Math.ceil((faultWindowEndsAt - Date.now()) / 1000));
    faultBannerEl.querySelector('.progress-notif-title').textContent =
        `Bloqueado: el inversor entró en modo FAULT, quedan ${restante} segundos`;
}

function sincronizarFaultWindow(nuevoFaultWindowEndsAt) {
    const eraActivo = !!faultWindowEndsAt && faultWindowEndsAt > Date.now();
    faultWindowEndsAt = nuevoFaultWindowEndsAt || null;
    const esActivo = !!faultWindowEndsAt && faultWindowEndsAt > Date.now();
    if (esActivo && !eraActivo) faultBannerDescartado = false; // ventana nueva: si habías cerrado el cartel de la anterior, esta es otra
    updateInverterState();
    actualizarBannerFault();
}

// --- Estado recibido del servidor (WS, mensajes 'relay_status') ---

function aplicarEstado(msg) {
    if (msg.relay1 !== undefined) relayStates[1] = msg.relay1;
    if (msg.relay2 !== undefined) relayStates[2] = msg.relay2;
    if (msg.relay3 !== undefined) relayStates[3] = msg.relay3;
    if (msg.espConnected !== undefined) espConnected = msg.espConnected;

    Object.entries(RELAY_ELEMENTS).forEach(([num, elementId]) => {
        updateRelayVisual(elementId, espConnected ? relayStates[num] : 'disconnected');
    });
    sincronizarFaultWindow(msg.faultWindowEndsAt);
    refreshAllButtons();
}

function conectarWebSocket() {
    const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocolo}//${window.location.host}`);

    socket.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        if (msg.type === 'relay_status') {
            aplicarEstado(msg);
        } else if (msg.type === 'inversor_instantaneo') {
            // Este módulo es dueño del WebSocket; el dashboard escucha el evento
            window.dispatchEvent(new CustomEvent('inversor-instantaneo', { detail: msg }));
        }
    };

    socket.onclose = () => {
        espConnected = false;
        Object.values(RELAY_ELEMENTS).forEach(elementId => updateRelayVisual(elementId, 'disconnected'));
        refreshAllButtons();
        setTimeout(conectarWebSocket, 5000);
    };

    socket.onerror = () => socket.close();
}

// --- Envío de comandos ---

async function sendCommand(relayNum, action) {
    try {
        const response = await fetch('/api/relay/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relayNum, action })
        });
        if (response.ok) return true;

        const data = await response.json().catch(() => ({}));
        if (response.status === 503) {
            showNotification('El agente-puente no está conectado, no se puede alcanzar el ESP32', 'error');
        } else {
            showNotification(data.message || 'No se pudo enviar el comando', 'error');
        }
        return false;
    } catch (error) {
        console.error('[relay] Error de red al enviar comando:', error);
        showNotification('Error de red al enviar el comando', 'error');
        return false;
    }
}

async function toggleRelay(relayNum) {
    if (buttonCooldowns[relayNum] || !espConnected) return;

    const action = relayStates[relayNum] === 'on' ? 'relay_off' : 'relay_on';
    const preCheck = checkInterlocks(relayNum, action);
    if (!preCheck.ok) {
        showNotification(preCheck.message, 'error');
        return;
    }

    buttonCooldowns[relayNum] = true;
    refreshButtonEnabled(relayNum);

    // El estado visual definitivo llega por WS (relay_status) — acá no se toca a mano.
    await sendCommand(relayNum, action);

    setTimeout(() => {
        buttonCooldowns[relayNum] = false;
        refreshButtonEnabled(relayNum);
    }, BUTTON_COOLDOWN_MS);
}

export function initRelayControl() {
    Object.entries(RELAY_ELEMENTS).forEach(([num, elementId]) => {
        const el = document.getElementById(elementId);
        if (el) el.addEventListener('click', () => toggleRelay(Number(num)));
        updateRelayVisual(elementId, 'disconnected');
    });
    updateInverterState();
    conectarWebSocket();
    setInterval(actualizarBannerFault, 1000); // cuenta regresiva fluida entre mensajes del WS
}
