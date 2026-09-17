import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const ESP32_RELAY_WS_URL = process.env.ESP32_RELAY_WS_URL || "ws://10.40.131.223:81/";
const ESP32_SENSOR_WS_URL = process.env.ESP32_SENSOR_WS_URL || "ws://10.40.131.230:81/";
const VPS_BRIDGE_WS_URL = process.env.VPS_BRIDGE_WS_URL || "ws://localhost:4000/ws/bridge";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const RECONNECT_DELAY_MS = 5000;

if (!BRIDGE_TOKEN) {
    console.error("Falta BRIDGE_TOKEN en el entorno. Abortando.");
    process.exit(1);
}

let relaySocket = null;
let vpsSocket = null;

// `assign` se llama con cada socket nuevo (incluso antes de abrir), para que la
// referencia externa (relaySocket/vpsSocket) siempre apunte a la conexión vigente,
// también después de una reconexión.
function connectWithRetry(name, url, { onOpen, onMessage, onClose, assign } = {}, options = {}) {
    console.log(`[${name}] Conectando a ${url}...`);
    const ws = new WebSocket(url, options);
    if (assign) assign(ws);

    ws.on("open", () => {
        console.log(`[${name}] Conectado`);
        if (onOpen) onOpen(ws);
    });

    ws.on("message", (data) => {
        if (onMessage) onMessage(ws, data);
    });

    ws.on("close", () => {
        console.log(`[${name}] Desconectado, reintentando en ${RECONNECT_DELAY_MS / 1000}s...`);
        if (onClose) onClose();
        setTimeout(() => connectWithRetry(name, url, { onOpen, onMessage, onClose, assign }, options), RECONNECT_DELAY_MS);
    });

    ws.on("error", (err) => {
        console.error(`[${name}] Error:`, err.message);
    });

    return ws;
}

// --- ESP32 de relés: mismo protocolo de texto que usaba el navegador directo ---
function startRelayConnection() {
    connectWithRetry(
        "esp32-relay",
        ESP32_RELAY_WS_URL,
        {
            assign: (ws) => { relaySocket = ws; },
            onOpen: (ws) => ws.send("get_status"),
            onMessage: (ws, data) => {
                let parsed;
                try {
                    parsed = JSON.parse(data.toString());
                } catch (e) {
                    return; // "pong" u otro texto plano, se ignora
                }
                if (parsed.relay1 !== undefined && parsed.relay2 !== undefined && parsed.relay3 !== undefined) {
                    sendToVps({
                        type: "relay_status",
                        relay1: parsed.relay1,
                        relay2: parsed.relay2,
                        relay3: parsed.relay3
                    });
                }
            }
        }
    );

    // Keepalive: el firmware responde 'pong' a 'ping' (ver ESP32_relayController_V4.ino)
    setInterval(() => {
        if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
            relaySocket.send("ping");
        }
    }, 20000);
}

// --- ESP32 de irradiancia/temperatura ---
function startSensorConnection() {
    connectWithRetry(
        "esp32-sensor",
        ESP32_SENSOR_WS_URL,
        {
            onMessage: (ws, data) => {
                let parsed;
                try {
                    parsed = JSON.parse(data.toString());
                } catch (e) {
                    return;
                }
                if (parsed.temperatura !== undefined && parsed.irradiancia !== undefined) {
                    sendToVps({
                        type: "irradiancia",
                        temperatura: parsed.temperatura,
                        irradiancia: parsed.irradiancia,
                        fecha_hora: new Date().toISOString().slice(0, 19).replace("T", " ")
                    });
                }
            }
        }
    );
}

// --- Conexión saliente hacia la VPS ---
function startVpsConnection() {
    connectWithRetry(
        "vps",
        VPS_BRIDGE_WS_URL,
        {
            assign: (ws) => { vpsSocket = ws; },
            onMessage: (ws, data) => {
                let msg;
                try {
                    msg = JSON.parse(data.toString());
                } catch (e) {
                    console.warn("[vps] Mensaje inválido:", data.toString());
                    return;
                }
                if (msg.type === "relay_command" && msg.command) {
                    if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
                        relaySocket.send(msg.command);
                    } else {
                        console.error("[vps] Comando recibido pero el ESP32 de relés no está conectado:", msg.command);
                    }
                }
            },
            onClose: () => { vpsSocket = null; }
        },
        { headers: { "x-bridge-token": BRIDGE_TOKEN } }
    );
}

function sendToVps(payload) {
    if (vpsSocket && vpsSocket.readyState === WebSocket.OPEN) {
        vpsSocket.send(JSON.stringify(payload));
    }
}

startRelayConnection();
startSensorConnection();
startVpsConnection();

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
