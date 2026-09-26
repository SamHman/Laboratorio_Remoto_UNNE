import db from "../db.js";
import { registrarManiobra } from "../services/maniobras.js";

// Estado en memoria de los 3 relés, alimentado por lo que reporta el agente-puente
// (que a su vez lo recibe del ESP32). Arranca en 'on' porque los relés están
// cableados al terminal normalmente cerrado (mismo supuesto que tenía SCADA.js).
const relayStates = { 1: "on", 2: "on", 3: "on" };

let bridgeSocket = null;
// Estado real del ESP32 (bridge-agent -> mensaje "esp_status"), distinto de
// isBridgeConnected(): el bridge-agent puede estar arriba y conectado a la VPS
// mientras el ESP32 esté apagado/inalcanzable. Arranca en false (fail-safe):
// hasta que no llegue un "esp_status" fresco no asumimos que el ESP32 está.
let esp32Connected = false;
let broadcastToBrowsers = () => {};
let faultTimer = null;
const FAULT_DELAY_MS = 320 * 1000;
// Momento (Date.now() + FAULT_DELAY_MS) en que termina la ventana de espera de
// reconexión, o null si no hay ninguna en curso. Va en el payload de relay_status
// para que el frontend pueda reconstruir el bloqueo y el cartel de cuenta regresiva
// aunque recién se haya conectado (recarga de página, reconexión de WS) - antes ese
// estado vivía solo en memoria del navegador y un refresh lo hacía desaparecer sin
// que la ventana real (server-side) hubiera terminado.
let faultWindowEndsAt = null;

function setBroadcastFn(fn) {
    broadcastToBrowsers = fn;
}

function attachBridge(ws) {
    bridgeSocket = ws;
    esp32Connected = false; // se corrige apenas llegue el próximo "esp_status" del bridge-agent
    broadcastRelayStatus();
    ws.on("message", (raw) => handleBridgeMessage(raw));
    ws.on("close", () => {
        if (bridgeSocket === ws) {
            bridgeSocket = null;
            broadcastRelayStatus();
        }
    });
}

function isBridgeConnected() {
    return !!bridgeSocket && bridgeSocket.readyState === 1; // WebSocket.OPEN
}

// Payload que espera el frontend (funciones/relay.js): estado de los 3 relés +
// espConnected, para poder avisar "sin conexión" sin depender de que un
// POST /api/relay/command falle con 503. espConnected exige bridge-agent Y
// ESP32 conectados a la vez (ver esp32Connected arriba) - antes solo miraba
// el bridge-agent, y mostraba "conectado" aunque el ESP32 estuviera apagado.
// getRelayStatusPayload() también la usa app/index.js para el mensaje inicial
// al conectar un navegador nuevo.
function getRelayStatusPayload() {
    return {
        type: "relay_status",
        relay1: relayStates[1],
        relay2: relayStates[2],
        relay3: relayStates[3],
        espConnected: isBridgeConnected() && esp32Connected,
        faultWindowEndsAt
    };
}

function broadcastRelayStatus() {
    broadcastToBrowsers(getRelayStatusPayload());
}

function handleBridgeMessage(raw) {
    let msg;
    try {
        msg = JSON.parse(raw.toString());
    } catch (e) {
        console.warn("[relay.controller] Mensaje inválido del bridge:", raw.toString());
        return;
    }

    if (msg.type === "relay_status") {
        updateStateFromEsp32(msg);
    } else if (msg.type === "esp_status") {
        esp32Connected = !!msg.connected;
        broadcastRelayStatus();
    }
}

function updateStateFromEsp32(msg) {
    const prev3 = relayStates[3];
    if (msg.relay1 !== undefined) relayStates[1] = msg.relay1 === "ON" ? "on" : "off";
    if (msg.relay2 !== undefined) relayStates[2] = msg.relay2 === "ON" ? "on" : "off";
    if (msg.relay3 !== undefined) relayStates[3] = msg.relay3 === "ON" ? "on" : "off";

    // Si el relay 3 se apaga antes de que se cumplan los 320s, cancelamos el fault pendiente.
    if (prev3 === "on" && relayStates[3] === "off" && faultTimer) {
        clearTimeout(faultTimer);
        faultTimer = null;
        faultWindowEndsAt = null;
    }

    broadcastRelayStatus();
}

// Puertos de las tres validaciones que antes vivían solo en SCADA.js (relayManager).
// Ahora son la fuente de verdad; el chequeo en el navegador queda solo como UX.
function checkEmergencyManeuver(relayNum, command) {
    if (command !== "relay_off") return { ok: true };
    const r1 = relayStates[1] === "on";
    const r2 = relayStates[2] === "on";
    const r3 = relayStates[3] === "on";
    if (!r3) return { ok: true };
    if (relayNum === 2 && !r1 && r2) return { ok: false, message: "Debes primero desconectar la Alterna" };
    if (relayNum === 1 && !r2 && r1) return { ok: false, message: "Debes primero desconectar la Alterna" };
    return { ok: true };
}

function checkCommissioningManeuver(relayNum, command) {
    if (command !== "relay_on") return { ok: true };
    if (relayNum === 3) {
        const allowed = relayStates[1] === "on" || relayStates[2] === "on";
        if (!allowed) {
            return { ok: false, message: "No se puede conectar el Inversor a la Alterna sin previamente la Alimentación de Continua" };
        }
    }
    return { ok: true };
}

function checkDisconnectionManeuver(relayNum, command) {
    if (command !== "relay_off") return { ok: true };
    const r1 = relayStates[1] === "on";
    const r2 = relayStates[2] === "on";
    const r3 = relayStates[3] === "on";
    if (!r3 && !r1 && relayNum === 2) return { ok: false, message: "No está permitido apagar el Inversor" };
    if (!r2 && relayNum === 1) return { ok: false, message: "No está permitido apagar el Inversor" };
    return { ok: true };
}

async function registrarHistorial(relayNum, accion, faultDetectado = false) {
    try {
        await db.query(
            "INSERT INTO historial_relay (relay_num, accion, fault_detectado) VALUES (?, ?, ?)",
            [relayNum, accion, faultDetectado]
        );
    } catch (error) {
        console.error("[relay.controller] Error al registrar historial:", error);
    }
}

function scheduleFaultCheck(relayNum) {
    if (faultTimer) clearTimeout(faultTimer);
    faultWindowEndsAt = Date.now() + FAULT_DELAY_MS;
    faultTimer = setTimeout(async () => {
        faultTimer = null;
        faultWindowEndsAt = null;
        if (relayStates[3] === "on") {
            console.log("[relay.controller] Fault detectado tras 320s con Relay 3 sostenido en ON");
            await registrarHistorial(relayNum, "encendido", true);
        }
        broadcastRelayStatus(); // avisa a los navegadores que la ventana de bloqueo terminó
    }, FAULT_DELAY_MS);
}

async function handleCommand(req, res) {
    const { relayNum, action } = req.body || {};
    const num = parseInt(relayNum, 10);
    if (![1, 2, 3].includes(num) || !["relay_on", "relay_off"].includes(action)) {
        return res.status(400).json({ status: "error", message: "relayNum (1-3) y action ('relay_on'|'relay_off') son requeridos" });
    }

    for (const check of [checkEmergencyManeuver, checkDisconnectionManeuver, checkCommissioningManeuver]) {
        const result = check(num, action);
        if (!result.ok) {
            return res.status(409).json({ status: "error", message: result.message });
        }
    }

    if (!isBridgeConnected()) {
        return res.status(503).json({ status: "error", message: "El agente-puente no está conectado, no se puede alcanzar el ESP32" });
    }
    if (!esp32Connected) {
        return res.status(503).json({ status: "error", message: "El ESP32 de relés no está conectado" });
    }

    const wasRelay3On = relayStates[3] === "on";
    const command = action === "relay_on" ? `relay_on${num}` : `relay_off${num}`;

    try {
        bridgeSocket.send(JSON.stringify({ type: "relay_command", command }));
    } catch (error) {
        console.error("[relay.controller] Error al enviar comando al bridge:", error);
        return res.status(500).json({ status: "error", message: "Error al enviar el comando al agente-puente" });
    }

    registrarManiobra();
    await registrarHistorial(num, action === "relay_on" ? "encendido" : "apagado");

    if (num === 3 && action === "relay_on" && !wasRelay3On) {
        scheduleFaultCheck(num);
    }

    return res.json({ status: "ok", relayNum: num, action });
}

export {
    setBroadcastFn,
    attachBridge,
    isBridgeConnected,
    getRelayStatusPayload,
    handleCommand,
    relayStates
};
