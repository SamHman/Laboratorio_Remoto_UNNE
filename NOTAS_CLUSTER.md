# Notas para escalar LabVirtualUNNE a un cluster (varias instancias)

Contexto: 2026-09-24, justo después de modularizar el dashboard (`app/public/funciones/`),
sacar el sistema de privilegios, agregar `/api/whoami`, y arreglar el acceso al `.env` en la
VPS (`Dockerfile.php`: `Options -Indexes` + `<Files ".env"> Require all denied`).

## Lo que ya está listo para correr en varias instancias a la vez

- **Login (JWT sin sesión en servidor)**: `authorization.js` valida el token de la cookie sin
  guardar nada en memoria del proceso. Cualquier instancia puede validar el token que generó
  cualquier otra — no hace falta "sticky session" para esto.
- **Dashboard (todo lo armado hoy)**: `app/public/funciones/*.js` hace *polling* HTTP puro cada
  30 s (`POLL_INTERVAL` en `config.js`) contra los PHP de `/app/api/`. No guarda estado en el
  servidor Node. Cualquier instancia responde igual.
- **MySQL compartido**: todas las instancias de Node/PHP leen la misma base vía `docker-compose`,
  así que los datos son consistentes entre réplicas (siempre que sigan apuntando a la misma BD).

## Lo que se rompe con más de una instancia: el control de relés

`app/controllers/relay.controller.js`:
```js
let bridgeSocket = null;                      // línea 9
const relayStates = { 1: "on", 2: "on", 3: "on" }; // línea 7
```
Estas dos variables viven en la memoria de **una sola instancia** de Node. El agente-puente
(`bridge-agent/`) abre **una única conexión WebSocket** (`/ws/bridge`, manejada en
`app/index.js`) hacia esa instancia en particular.

Con 2+ réplicas detrás de un balanceador:
1. El bridge-agent queda conectado a una sola instancia. Las demás no tienen `bridgeSocket` y
   no pueden mandarle comandos al ESP32, aunque reciban el `POST /api/relay/command` del navegador.
2. `relayStates` (el estado on/off de los 3 relés) tampoco se comparte entre instancias — otra
   instancia no sabe si un relé está prendido o apagado.
3. El WebSocket de navegadores (`wss.on('connection')` en `app/index.js`) que reenvía
   `relay_status` tiene el mismo problema: cada instancia solo conoce lo que le llegó directo a
   ella.

Un navegador que le pegue a la instancia "equivocada" (sin el bridge conectado) va a fallar el
comando o ver un estado de relés desactualizado.

## Qué hace falta antes de escalar el control de relés

1. Un canal compartido entre instancias (Redis pub/sub, o una cola) para publicar comandos y
   estado de relés, en vez de guardarlos en variables de JS de una sola instancia.
2. Afinidad de sesión (sticky) para la conexión del bridge-agent, o que solo una instancia
   designada mantenga esa conexión mientras el resto solo publica/escucha en el canal compartido.
3. Mismo tratamiento para el WebSocket de navegadores: sin estado compartido, cada instancia
   solo sabe lo que le llegó directo a ella.

## Decisión pendiente

Si el cluster es solo para escalar el **dashboard** (lectura de datos), probablemente no haga
falta tocar nada de esto: alcanza con que esa parte escale a varias instancias y el control de
relés (bajo uso, un solo ESP32 físico de una facultad) siga corriendo en una sola instancia
designada. Definir esto antes de rediseñar el control de relés para multi-instancia si no hace
falta.

**Próximo paso ya decidido con el usuario:** resolver el control de relés es la tarea
inmediatamente siguiente a este documento — no es cluster todavía, es portar la lógica de
relés al `SCADA.js` nuevo (ver `funciones/`). Ahí es buen momento para revisar si conviene
dejar preparado el desacople de estado en memoria aunque el cluster no se arme todavía.
