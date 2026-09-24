import  express  from "express";
import cookieParser from 'cookie-parser';
//Fix para __direname
import path from 'path';
import {fileURLToPath} from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {methods as authentication} from "./controllers/authentication.controller.js"
import {methods as authorization} from "./middlewares/authorization.js";
import * as dataController from "./controllers/data.controller.js";
import * as relayController from "./controllers/relay.controller.js";
import * as telemetryController from "./controllers/telemetry.controller.js";

// Server
const app = express();
const PORT = process.env.PORT || 4000;

// Crear el servidor HTTP
const server = createServer(app);

// Dos WebSocketServer separados sobre el mismo HTTP server: uno para los
// navegadores (broadcast de datos, sin path fijo) y otro para el agente-puente
// on-prem (path /ws/bridge, autenticado con BRIDGE_TOKEN). Se despachan a mano
// en el evento 'upgrade' del server porque dejar uno de los dos sin `path` haría
// que ambas instancias intenten atender la misma conexión (ver docs de `ws`).
const wss = new WebSocketServer({ noServer: true });
const wssBridge = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);

    if (pathname === "/ws/bridge") {
        const token = request.headers["x-bridge-token"];
        if (!token || token !== process.env.BRIDGE_TOKEN) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }
        wssBridge.handleUpgrade(request, socket, head, (ws) => {
            wssBridge.emit("connection", ws, request);
        });
    } else {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    }
});

wssBridge.on("connection", (ws) => {
    console.log("Agente-puente conectado");
    relayController.attachBridge(ws);
});

// Almacenar todos los clientes conectados
const connectedClients = new Set();

relayController.setBroadcastFn((payload) => {
    const message = JSON.stringify(payload);
    connectedClients.forEach((client) => {
        if (client.readyState === 1) client.send(message);
    });
});

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
    console.log('Nuevo cliente conectado');
    connectedClients.add(ws);

    // Enviar el estado actual de los relés (lo mantiene relayController, alimentado por el bridge)
    ws.send(JSON.stringify({
        type: 'relay_status',
        relay1: relayController.relayStates[1] === 'on' ? 'ON' : 'OFF',
        relay2: relayController.relayStates[2] === 'on' ? 'ON' : 'OFF',
        relay3: relayController.relayStates[3] === 'on' ? 'ON' : 'OFF'
    }));

    ws.on('close', () => {
        console.log('Cliente desconectado');
        connectedClients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        connectedClients.delete(ws);
    });
});

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`WebSocket disponible en ws://localhost:${PORT}`);
});

// Manejo de señales para un cierre limpio
const shutdown = (signal) => {
    console.log(`\nRecibida señal ${signal}. Cerrando servidor...`);

    // Cerrar todas las conexiones WebSocket
    connectedClients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.close(1000, 'Servidor cerrando');
        }
    });
    connectedClients.clear();
    console.log('Conexiones WebSocket cerradas');
    
    // Cerrar los servidores WebSocket
    wss.close(() => {
        console.log('Servidor WebSocket cerrado');
    });
    wssBridge.close(() => {
        console.log('Servidor WebSocket del bridge cerrado');
    });
    
    // Cerrar el servidor HTTP
    server.close(() => {
        console.log('Servidor HTTP cerrado correctamente');
        process.exit(0);
    });

    // Forzar cierre después de 5 segundos si algo falla
    setTimeout(() => {
        console.error('Forzando cierre del servidor...');
        process.exit(1);
    }, 5000);
};

// Manejadores de señales
process.on('SIGINT', () => shutdown('SIGINT'));  // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('Error no capturado:', err);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa rechazada no manejada:', reason);
    shutdown('unhandledRejection');
});

//Middleware
app.use(express.static(__dirname + "/public"));
app.use(express.json());
app.use(cookieParser())


//URL
// Cambiar la ruta principal '/' para que requiera autenticación y sirva SCADA.html
app.get("/", authorization.soloAdmin, (req, res) => {
    console.log("Sirviendo SCADA.html");
    res.sendFile(path.join(__dirname, "pages", "admin", "SCADA.html"));
});
// Nueva ruta para login, protegida para solo público
app.get("/login", authorization.soloPublico, (req, res) => {
    console.log("Sirviendo login.html");
    res.sendFile(path.join(__dirname, "pages", "login.html"));
});
// Registro solo para no logeados
app.get("/register", authorization.soloPublico, (req, res) => res.sendFile(path.join(__dirname, "pages", "register.html")));
// SCADA sigue disponible explícitamente
app.get("/SCADA", authorization.soloAdmin, (req, res) => res.sendFile(path.join(__dirname, "pages", "admin", "SCADA.html")));

// Rutas de autenticación
app.post("/api/login",authentication.login);
app.post("/api/register",authentication.register);
app.get("/api/whoami", authorization.soloAdmin, authentication.whoami);

// Rutas para insertar datos
app.post("/api/inversor", authorization.soloAdmin, dataController.insertInversorData);
app.post("/api/irradiancia", authorization.soloAdmin, dataController.insertIrradianciaData);

// Ruta para guardar datos de sensores desde el ESP32
app.post("/api/save-sensor-data", dataController.saveSensorData);

// Control de relés: valida server-side las maniobras y reenvía al agente-puente
app.post("/api/relay/command", authorization.soloAdmin, relayController.handleCommand);

// Ingesta de telemetría (script DTU + agente-puente), autenticada por API key
app.post("/api/telemetry/inversor", authorization.soloApiKey, telemetryController.ingestInversor);
app.post("/api/telemetry/irradiancia", authorization.soloApiKey, telemetryController.ingestIrradiancia);


