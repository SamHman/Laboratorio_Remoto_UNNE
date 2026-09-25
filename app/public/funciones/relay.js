

import { showNotification, mostrarProgreso } from './notificaciones.js';

const RELAY_ELEMENTS = {
    1: 'esp8266-top',
    2: 'esp8266-bottom',
    3: 'esp8266-right'
};

const BUTTON_COOLDOWN_MS = 5000;
const FAULT_DELAY_S = 320; // igual a FAULT_DELAY_MS en relay.controller.js

let relayStates = { 1: 'on', 2: 'on', 3: 'on' };
let espConnected = false;
const buttonCooldowns = {};
let cerrarBannerFault = null;
let socket = null;

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

// El inversor no tiene comando propio: su ícono se deriva del estado de Relay 3.
// (El código viejo tenía un tercer caso "OFF" para cuando R1/R2/R3 están todos
// apagados, pero nunca se ejecutaba: el primer "if" ya cubre cualquier R3 apagado.)
function updateInverterState() {
    const img = document.getElementById('goodwe-inverter');
    const status = document.getElementById('status-goodwe-inverter');
    const block = document.getElementById('block-goodwe-inverter');
    if (!img || !status || !block) return;

    const relay3On = relayStates[3] === 'on';
    block.classList.remove('on', 'fault');
    img.classList.remove('on', 'fault');

    if (relay3On) {
        img.src = 'images/Inverter_ON.png';
        status.textContent = 'ON';
        block.classList.add('on');
        img.classList.add('on');
    } else {
        img.src = 'images/Inverter_Fault.png';
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

// --- Banner de espera de reconexión del inversor (Relay 3 ON) ---

function manejarBannerFault(wasOn, isOn) {
    if (!wasOn && isOn) {
        if (cerrarBannerFault) cerrarBannerFault();
        cerrarBannerFault = mostrarProgreso('Inversor en modo Fault esperando reconexión...', FAULT_DELAY_S);
    } else if (wasOn && !isOn && cerrarBannerFault) {
        cerrarBannerFault();
        cerrarBannerFault = null;
    }
}

// --- Estado recibido del servidor (WS, mensajes 'relay_status') ---

function aplicarEstado(msg) {
    const relay3Antes = relayStates[3] === 'on';

    if (msg.relay1 !== undefined) relayStates[1] = msg.relay1;
    if (msg.relay2 !== undefined) relayStates[2] = msg.relay2;
    if (msg.relay3 !== undefined) relayStates[3] = msg.relay3;
    if (msg.espConnected !== undefined) espConnected = msg.espConnected;

    Object.entries(RELAY_ELEMENTS).forEach(([num, elementId]) => {
        updateRelayVisual(elementId, espConnected ? relayStates[num] : 'disconnected');
    });
    updateInverterState();
    refreshAllButtons();

    manejarBannerFault(relay3Antes, relayStates[3] === 'on');
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
}
