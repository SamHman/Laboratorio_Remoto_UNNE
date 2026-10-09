import crypto from "crypto";
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

// Una sola orden en curso a la vez, para TODAS las cuentas y navegadores. Se toma al
// entrar a handleCommand / resetAllRelaysOn y se suelta recién cuando el ESP32 confirmó
// (ACK/NACK) o falló, para que la orden siguiente se valide contra el estado ya actualizado.
// Las órdenes que llegan con el bloqueo tomado se rechazan, no se encolan.
let ocupado = false;

// Orden enviada al bridge-agent y esperando su relay_command_result: { id, resolve, timer }
let ordenEnCurso = null;
// El bridge-agent corta a los 3s si el ESP32 no responde; acá se espera un poco más
const COMMAND_RESULT_TIMEOUT_MS = 5000;

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
            liberarOrden({ ok: false, reason: "El agente-puente se desconectó" });
            broadcastRelayStatus();
        }
    });
}

function liberarOrden(resultado) {
    if (!ordenEnCurso) return;
    clearTimeout(ordenEnCurso.timer);
    const { resolve } = ordenEnCurso;
    ordenEnCurso = null;
    resolve(resultado);
}

// Envía el comando al bridge-agent y espera su relay_command_result.
// Siempre resuelve: { ok, reason?, timeout? }. `ok:false` sin `reason` es un NACK del ESP32.
function enviarOrden(command) {
    return new Promise((resolve) => {
        const id = crypto.randomUUID();
        ordenEnCurso = {
            id,
            resolve,
            timer: setTimeout(
                () => liberarOrden({ ok: false, reason: "El agente-puente no respondió", timeout: true }),
                COMMAND_RESULT_TIMEOUT_MS
            )
        };
        try {
            bridgeSocket.send(JSON.stringify({ type: "relay_command", id, command }));
        } catch (error) {
            console.error("[relay.controller] Error al enviar comando al bridge:", error);
            liberarOrden({ ok: false, reason: "Error al enviar el comando al agente-puente" });
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
    } else if (msg.type === "relay_command_result") {
        if (!ordenEnCurso || msg.id !== ordenEnCurso.id) {
            console.warn("[relay.controller] relay_command_result sin orden pendiente o de otra orden, se ignora:", msg.id);
            return;
        }
        // El ACK/NACK trae el estado real de los relés: se aplica siempre, así un NACK
        // también resincroniza el caché si estaba desfasado
        if (msg.relay1 !== undefined) updateStateFromEsp32(msg);
        liberarOrden({ ok: msg.ok === true, reason: msg.reason });
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

// Mientras dura la ventana de Fault (ver scheduleFaultCheck/faultWindowEndsAt), Relay 3
// queda bloqueado: no se puede apagar hasta que termine la espera de reconexión. Antes
// apagarlo cancelaba el fault pendiente (una "salida de emergencia" implícita); ahora
// esa salida ya no existe a pedido explícito - el bloqueo tiene que sostenerse los
// ~320s enteros para que el cartel/ícono de "Bloqueado" en el frontend sea verdad.
function checkFaultLock(relayNum, command) {
    if (relayNum !== 3 || command !== "relay_off") return { ok: true };
    if (!faultWindowEndsAt || faultWindowEndsAt <= Date.now()) return { ok: true };
    const restanteS = Math.ceil((faultWindowEndsAt - Date.now()) / 1000);
    return { ok: false, message: `El inversor está en modo FAULT, no se puede apagar hasta que termine la espera (~${restanteS}s)` };
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
    // Los navegadores se enteran de la ventana ya, sin esperar el próximo relay_status del ESP32
    // (con el ACK, el estado puede haber llegado antes de que se arme esta ventana)
    broadcastRelayStatus();
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

    // Una sola orden a la vez para todas las cuentas: se rechaza (no se encola) y se toma
    // ANTES de validar, para que las reglas corran contra el estado ya actualizado
    if (ocupado) {
        return res.status(409).json({ status: "error", message: "Hay otra orden en curso, esperá unos segundos" });
    }
    ocupado = true;

    try {
        for (const check of [checkEmergencyManeuver, checkDisconnectionManeuver, checkCommissioningManeuver, checkFaultLock]) {
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

        // Se lee antes de enviar: el resultado del ESP32 actualiza relayStates[3]
        const wasRelay3On = relayStates[3] === "on";
        const command = action === "relay_on" ? `relay_on${num}` : `relay_off${num}`;

        const resultado = await enviarOrden(command);

        if (!resultado.ok) {
            // ok:false sin `reason` = NACK del ESP32 (rechazó la orden); con `reason` = falla de transporte
            console.warn(`[relay.controller] ${command} no se aplicó: ${resultado.reason || "NACK del ESP32"}`);
            if (resultado.timeout) {
                return res.status(504).json({ status: "error", message: "El agente-puente no respondió, no se pudo confirmar la orden" });
            }
            if (resultado.reason) {
                return res.status(502).json({ status: "error", message: `No se pudo aplicar la orden: ${resultado.reason}` });
            }
            return res.status(409).json({ status: "error", message: "El ESP32 rechazó la orden (operación no permitida con el estado actual)" });
        }

        // Recién con el ACK del ESP32 la maniobra cuenta: historial, contador y ventana de Fault
        registrarManiobra();
        await registrarHistorial(num, action === "relay_on" ? "encendido" : "apagado");

        if (num === 3 && action === "relay_on" && !wasRelay3On) {
            scheduleFaultCheck(num);
        }

        return res.json({ status: "ok", relayNum: num, action });
    } finally {
        ocupado = false;
    }
}

const RESET_GAP_MS = 1500; // separación entre comandos al ESP32

// Reset a condiciones normales: deja los 3 relés en ON (usado por el scheduler de
// services/resetRelays.js). Se salta los interlocks a propósito - solo enciende, y
// lo hace en orden 1, 2, 3 para que Relay 3 (inversor) encuentre la continua ya
// conectada, igual que exige checkCommissioningManeuver. Devuelve:
//   { ok: true, enviados: [..] }  -> listo (enviados puede estar vacío si ya estaban en ON)
//   { ok: false, motivo }          -> no se pudo (bridge/ESP32 caído), conviene reintentar
async function resetAllRelaysOn() {
    const apagados = [1, 2, 3].filter(n => relayStates[n] !== "on");
    if (apagados.length === 0) return { ok: true, enviados: [] };

    if (!isBridgeConnected()) return { ok: false, motivo: "agente-puente no conectado" };
    if (!esp32Connected) return { ok: false, motivo: "ESP32 de relés no conectado" };
    if (ocupado) return { ok: false, motivo: "hay otra orden en curso" };
    ocupado = true;

    try {
        const wasRelay3On = relayStates[3] === "on";
        const enviados = [];
        for (const num of apagados) {
            const resultado = await enviarOrden(`relay_on${num}`);
            if (!resultado.ok) {
                const motivo = resultado.reason || "rechazada por el ESP32";
                console.error(`[relay.controller] Reset: relay_on${num} no se aplicó (${motivo})`);
                return { ok: false, motivo: `relay_on${num} no se aplicó (${motivo})` };
            }
            enviados.push(num);
            registrarManiobra();
            await registrarHistorial(num, "encendido");
            if (num === 3 && !wasRelay3On) scheduleFaultCheck(num);
            await new Promise(resolve => setTimeout(resolve, RESET_GAP_MS));
        }
        return { ok: true, enviados };
    } finally {
        ocupado = false;
    }
}

export {
    resetAllRelaysOn,
    setBroadcastFn,
    attachBridge,
    isBridgeConnected,
    getRelayStatusPayload,
    handleCommand,
    relayStates
};
