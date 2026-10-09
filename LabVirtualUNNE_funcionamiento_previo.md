# LabVirtualUNNE: cómo funcionaba el control de relés ANTES de la refactorización

Registro de contexto (fecha: 2026-10-09). Describe el estado **previo** a adaptar LabVirtualUNNE al firmware `ESP32_relayController_V6` (con ACK/NACK). Está hecho leyendo el código; no se ejecutó nada.

Archivos descritos (rutas bajo `D:\xampp\htdocs\LabVirtualUNNE\`):

| Pieza | Archivo | Dónde corre |
|---|---|---|
| Servidor | `app\controllers\relay.controller.js` | VPS (Node) |
| Navegador | `app\public\funciones\relay.js` | Navegador del usuario |

Archivos relacionados: `app\index.js` (conecta todo) y `app\services\resetRelays.js` (reset diario). El agente-puente que corre en la PC (`D:\xampp\htdocs\LabVirtualUNNE-bridge-agent`) no se describe acá. La carpeta `LabVirtualUNNE\bridge-agent` es un duplicado viejo y desactualizado, y no debe tomarse como referencia.

## Arquitectura

```
Navegador ──HTTP POST /api/relay/command──► Servidor (VPS) ◄──WS /ws/bridge── Agente-puente ──► ESP32
Navegador ◄──────── WS general (relay_status) ───────────┘
```

- El navegador **nunca** habla con el ESP32.
- El servidor guarda en memoria una copia del estado de los relés y valida las órdenes contra ella.
- El firmware con el que se escribió todo esto era V5 (ver `CLAUDE.md`).

## Mensajes que intercambian estas dos piezas

| Tramo | Mensaje | Contenido |
|---|---|---|
| Navegador a servidor | `POST /api/relay/command` | `{relayNum: 1..3, action: "relay_on" \| "relay_off"}` |
| Servidor a agente-puente | `relay_command` | `{type, command: "relay_on1"…"relay_off3"}` |
| Agente-puente a servidor | `relay_status` | `{type, relay1, relay2, relay3}` ("ON"/"OFF") |
| Agente-puente a servidor | `esp_status` | `{type, connected: true/false}` |
| Servidor a navegadores | `relay_status` (broadcast WS) | `{relay1..3: "on"/"off", espConnected, faultWindowEndsAt}` |

No existe ningún mensaje de resultado de una orden: ni `id`, ni ACK, ni NACK.

## `relay.controller.js` (servidor)

**Estado en memoria:** `relayStates` (arranca `{1:"on",2:"on",3:"on"}`), `bridgeSocket`, `esp32Connected` (arranca `false`, fail-safe), `faultTimer`, `faultWindowEndsAt`, y `broadcastToBrowsers` (se inyecta desde `index.js`).

**Cuando el agente-puente se conecta (`attachBridge`):** guarda el socket, fuerza `esp32Connected = false`, hace broadcast, y escucha mensajes. Al cerrarse, borra el socket y hace broadcast.

**Mensajes que entiende (`handleBridgeMessage`):**
- `relay_status`: traduce `"ON"` a `"on"` (cualquier otro valor queda `"off"`), actualiza `relayStates` y hace broadcast. Si R3 pasó de on a off y hay un Fault pendiente, cancela el temporizador.
- `esp_status`: actualiza `esp32Connected` y hace broadcast.
- Todo lo demás se ignora.

**Payload al navegador (`getRelayStatusPayload`):** `espConnected = bridge conectado Y esp32Connected`.

**Cuatro reglas** (orden de evaluación y mensaje; el primer fallo da 409):

| Orden | Regla | Impide |
|---|---|---|
| 1 | `checkEmergencyManeuver` | Con R3 ON, apagar R2 si solo R2 aporta continua, o apagar R1 si solo R1 aporta ("Debes primero desconectar la Alterna") |
| 2 | `checkDisconnectionManeuver` | Dejar todo apagado ("No está permitido apagar el Inversor") |
| 3 | `checkCommissioningManeuver` | Encender R3 sin R1 ni R2 en ON |
| 4 | `checkFaultLock` | Apagar R3 durante la ventana de Fault |

Las tres primeras equivalen a `SecurityManagement1`, `3` y `2` del firmware V6. La cuarta existe solo en el servidor.

**`handleCommand`, en orden:**
1. Valida el cuerpo (400).
2. Corre las cuatro reglas contra `relayStates` (409).
3. Comprueba bridge conectado (503) y ESP32 conectado (503).
4. Envía `relay_command` al agente-puente (500 si el envío lanza error).
5. `registrarManiobra()` y `INSERT` en `historial_relay`.
6. Si fue `relay_on3` y R3 estaba apagado, `scheduleFaultCheck`.
7. Responde `{status:"ok"}` **sin esperar al ESP32**.

**Ventana de Fault (`scheduleFaultCheck`):** fija `faultWindowEndsAt = ahora + 320 s` y un temporizador. Al vencer limpia la ventana y, si R3 sigue en `"on"`, escribe en `historial_relay` una fila con `fault_detectado = true`. Luego hace broadcast.

**`resetAllRelaysOn`:** toma los relés que no están en ON y, si hay bridge y ESP32, les envía `relay_on` en orden 1, 2, 3 con 1,5 s entre cada uno. Salta las reglas a propósito. Registra maniobra e historial, y arranca el Fault si encendió R3. Devuelve `{ok, enviados}` o `{ok:false, motivo}`. No espera confirmación del ESP32.

**Quién lo llama:** `app\services\resetRelays.js`, que ejecuta el reset todos los días a las 18:40 (hora Argentina), con ticks de 15 s y una ventana de reintento de 10 min si el bridge o el ESP32 no están conectados.

## `relay.js` (navegador)

**Estado local:** `relayStates` (arranca todo `'on'`), `espConnected`, `buttonCooldowns` (por relé), `faultWindowEndsAt`, y el cartel de Fault.

**Arranque (`initRelayControl`):** engancha el clic de cada relé, los muestra "Desconectado", abre el WebSocket y actualiza el cartel de Fault cada segundo.

**WebSocket (`conectarWebSocket`):** `relay_status` llama a `aplicarEstado`; `inversor_instantaneo` se reemite como evento de `window`. Al cerrarse marca todo desconectado y reintenta a los 5 s.

**`aplicarEstado`:** es el **único lugar donde cambia el dibujo de los relés**. Copia el estado, redibuja, sincroniza la ventana de Fault y recalcula botones.

**Clic (`toggleRelay`):**
1. Ignora si el botón está en enfriamiento o no hay ESP32.
2. Decide la acción por el estado **local** (si figura on, manda `relay_off`).
3. Corre las mismas reglas que el servidor solo para dar feedback inmediato (`checkInterlocks`).
4. Activa el enfriamiento de 5 s de **ese relé** y lo deshabilita.
5. Hace el POST (`sendCommand`).
6. A los 5 s libera el enfriamiento.

**`sendCommand`:** si la respuesta es `ok`, no hace nada y espera el `relay_status` por WebSocket. Si es **503** muestra siempre el aviso fijo "El agente-puente no está conectado…", aunque el motivo real sea que el ESP32 esté desconectado. Con cualquier otro código muestra `data.message`. Un error de red muestra un aviso genérico.

**Botones:** habilitados si hay ESP32, no están en enfriamiento y, solo el R3, no hay ventana de Fault. El ícono del inversor se deriva de R3 y de la ventana de Fault (FAULT si R3 está off o si la ventana está activa).

## Limitaciones del diseño previo (observadas al leer estos dos archivos)

1. El servidor responde "ok" antes de saber si el ESP32 aplicó la orden.
2. El historial, el contador de maniobras y la ventana de Fault se registran en ese momento, sin esperar la confirmación.
3. Las reglas del servidor se evalúan contra un caché que solo se actualiza cuando el ESP32 reporta, así que dos órdenes seguidas se validan contra el mismo estado viejo.
4. El enfriamiento de 5 s es por relé y por navegador; con varias cuentas o relés distintos las órdenes se pisan. No hay bloqueo global de "una orden en curso".
5. El navegador muestra siempre el mismo aviso para cualquier 503.
6. `resetAllRelaysOn` no comprueba que cada orden se haya aplicado.
7. `CLAUDE.md` todavía menciona `ESP32_relayController_V5.ino`.

## Contexto de la conversación

- Hay un error real vivido por el usuario: con varias cuentas y órdenes pulsadas repetidamente, se saltearon protecciones por órdenes acumuladas. Decisión: **una sola orden en curso a la vez**, rechazando la segunda (sin cola), con el bloqueo en el servidor.
- Plan acordado en líneas generales (aún sin implementar): bloqueo global en el servidor, un mensaje de resultado de la orden con `id` desde el agente-puente, y registrar historial y Fault solo tras el ACK. El firmware V6 responde cada orden con un `cmd_ack` (`ok`, `reason` opcional y el estado de los tres relés); su detalle está en `Refactorización.md`, dentro de `E:\ProyectoFinal\AL_PENDRIVE_5_10_2026\Refactoreando\Manual_REFACTOR_ESP32\`.
- Pendiente de decidir: si los NACK se registran en `historial_relay` (se sugirió empezar con un log del servidor).
