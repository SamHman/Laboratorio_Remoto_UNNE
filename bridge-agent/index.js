import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

// ESP32 nuevo en 10.40.131.240 (reemplaza al que estaba en 10.40.131.223,
// ver ESP32_relayController_V5.ino) - cambiar acá si la IP real es otra.
const ESP32_RELAY_WS_URL = process.env.ESP32_RELAY_WS_URL || "ws://10.40.131.240:81/";
const VPS_BRIDGE_WS_URL = process.env.VPS_BRIDGE_WS_URL || "ws://localhost:4000/ws/bridge";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 20000;

if (!BRIDGE_TOKEN) {
    console.error("Falta BRIDGE_TOKEN en el entorno. Abortando.");
    process.exit(1);
}

const READY_STATE_NAMES = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
function readyStateName(ws) {
    if (!ws) return "sin socket (null)";
    return READY_STATE_NAMES[ws.readyState] || `desconocido (${ws.readyState})`;
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
        console.log(`[${name}] <- mensaje crudo:`, data.toString());
        if (onMessage) onMessage(ws, data);
    });

    ws.on("close", (code, reason) => {
        console.log(`[${name}] Desconectado (code=${code}, reason="${reason}"), reintentando en ${RECONNECT_DELAY_MS / 1000}s...`);
        if (onClose) onClose(code, reason);
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
            onOpen: (ws) => {
                console.log("[esp32-relay] -> get_status");
                ws.send("get_status");
                sendToVps({ type: "esp_status", connected: true });
            },
            onMessage: (ws, data) => {
                let parsed;
                try {
                    parsed = JSON.parse(data.toString());
                } catch (e) {
                    console.log("[esp32-relay] mensaje no-JSON (probablemente 'pong'), se ignora");
                    return;
                }
                if (parsed.relay1 !== undefined && parsed.relay2 !== undefined && parsed.relay3 !== undefined) {
                    console.log(`[esp32-relay] estado: relay1=${parsed.relay1} relay2=${parsed.relay2} relay3=${parsed.relay3}`);
                    sendToVps({
                        type: "relay_status",
                        relay1: parsed.relay1,
                        relay2: parsed.relay2,
                        relay3: parsed.relay3
                    });
                } else {
                    console.log("[esp32-relay] JSON sin relay1/2/3, se ignora:", parsed);
                }
            },
            onClose: () => {
                relaySocket = null;
                sendToVps({ type: "esp_status", connected: false });
            }
        }
    );

    // Keepalive: el firmware responde 'pong' a 'ping' (confirmado en
    // ESP32_relayController_V5.ino:177-179, mismo protocolo que V4).
    setInterval(() => {
        if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
            console.log("[esp32-relay] -> ping (keepalive)");
            relaySocket.send("ping");
        } else {
            console.log(`[esp32-relay] keepalive salteado, socket en estado: ${readyStateName(relaySocket)}`);
        }
    }, PING_INTERVAL_MS);
}

// --- Conexión saliente hacia la VPS ---
function startVpsConnection() {
    connectWithRetry(
        "vps",
        VPS_BRIDGE_WS_URL,
        {
            assign: (ws) => { vpsSocket = ws; },
            onOpen: () => {
                // Por si relaySocket ya estaba abierto/cerrado antes de que esta conexión
                // existiera (o en una reconexión): la VPS necesita el estado actual ya,
                // no solo el próximo cambio.
                sendToVps({ type: "esp_status", connected: !!(relaySocket && relaySocket.readyState === WebSocket.OPEN) });
            },
            onMessage: (ws, data) => {
                let msg;
                try {
                    msg = JSON.parse(data.toString());
                } catch (e) {
                    console.warn("[vps] Mensaje inválido:", data.toString());
                    return;
                }
                if (msg.type === "relay_command" && msg.command) {
                    console.log(`[vps] Comando recibido: ${msg.command} (esp32-relay: ${readyStateName(relaySocket)})`);
                    if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
                        relaySocket.send(msg.command);
                    } else {
                        console.error(`[vps] Comando ${msg.command} descartado: el ESP32 de relés no está conectado (estado: ${readyStateName(relaySocket)})`);
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
    } else {
        console.warn(`[vps] No se pudo enviar (socket a la VPS en estado: ${readyStateName(vpsSocket)}):`, payload);
    }
}

startRelayConnection();
startVpsConnection();

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
