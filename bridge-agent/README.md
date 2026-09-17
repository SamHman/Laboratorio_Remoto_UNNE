# Agente-puente LabVirtualUNNE

Corre en una PC de la facultad con visibilidad de red a los dos ESP32
(el de relés y el de irradiancia/temperatura, en la LAN `10.40.x.x`). Es el
único proceso autorizado a hablarles: mantiene una conexión saliente hacia la
API en la VPS y reenvía comandos/estado en las dos direcciones. No corre en la
VPS ni entra al `docker-compose.yml` del proyecto.

## Instalación

```bash
cd bridge-agent
npm install
cp .env.example .env
# completar BRIDGE_TOKEN con el mismo valor que tiene la VPS en su .env,
# y VPS_BRIDGE_WS_URL con el dominio real (wss://labvirtualunne.linkgestion.com/ws/bridge)
npm start
```

## Qué hace

- Se conecta como cliente WebSocket al ESP32 de relés (`ESP32_RELAY_WS_URL`) y
  reenvía su estado (`relay1/2/3`) a la VPS cada vez que cambia.
- Se conecta como cliente WebSocket al ESP32 de irradiancia (`ESP32_SENSOR_WS_URL`)
  y reenvía cada lectura de temperatura/irradiancia a la VPS.
- Se conecta a la VPS (`VPS_BRIDGE_WS_URL`, autenticado con `BRIDGE_TOKEN` en el
  header `x-bridge-token`) y reenvía al ESP32 de relés los comandos
  (`relay_on1`, `relay_off2`, etc.) que la API ya validó server-side.
- Reconecta automáticamente cada 5s si se cae cualquiera de las tres conexiones.

## Correrlo como servicio

Para dejarlo corriendo permanentemente en la PC de la facultad, usar `pm2`,
un servicio de systemd, o (si la máquina es Windows) el Programador de Tareas
con `npm start` como acción — no requiere Docker ni XAMPP.
