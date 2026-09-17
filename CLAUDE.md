# CLAUDE.md — Guía operativa para agentes IA en LabVirtualUNNE

> Leé esto entero antes de tocar cualquier archivo.

---

## Qué es este proyecto

**LabVirtualUNNE** es un laboratorio remoto (no simulado) de energía solar
fotovoltaica de la UNNE: un SCADA web que opera relés físicos y monitorea un
inversor GoodWe real, instalado en la facultad (red `10.40.x.x`).

Es un repo de terceros (`SamHman`/`Charly_Sam20`) que se dockerizó y movió a
la VPS Contabo para exponerlo en `https://labvirtualunne.linkgestion.com`. El
hardware (dos ESP32: uno de relés, uno de irradiancia/temperatura) **se queda
físicamente en la LAN de la facultad** — no es alcanzable desde la VPS.

Stack en Docker Compose:

| Servicio | Tecnología | Puerto local | Rol |
|---|---|---|---|
| `node` | Express + `ws` | `127.0.0.1:8155` | SCADA, login/JWT, WS de navegador, WS del bridge, control de relés, ingesta de telemetría |
| `php` | PHP 8 + Apache | interno | Endpoints legacy de solo lectura/exportación (`obtener_datos_*`, `exportar_datos_dashboard.php`, `diagnostico*.php`) |
| `mysql` | MySQL 8 | interno | Base `labvirtual` |
| `nginx` | nginx | `127.0.0.1:8154` (detrás de Traefik) | Proxy público: `/app/api/` → `php`, todo lo demás → `node` |

Además hay una pieza que **no** vive en la VPS: `bridge-agent/`, un proceso
Node standalone que corre en una PC de la facultad, con visibilidad de red a
los dos ESP32. Es el único que les habla directo; mantiene una conexión
saliente autenticada (`BRIDGE_TOKEN`) hacia `node` en la VPS. Ver
`bridge-agent/README.md`.

---

## Arquitectura de control de relés (importante)

Antes el navegador hablaba WebSocket directo al ESP32 de relés. Ahora:

1. El navegador hace `POST /api/relay/command` a `node` (protegido con la
   cookie JWT de sesión, `soloAdmin`).
2. `app/controllers/relay.controller.js` re-valida las tres reglas de
   seguridad eléctrica (antes solo vivían en `SCADA.js`) contra un caché en
   memoria del estado de los relés, y si pasan, reenvía el comando exacto
   (`relay_on1`, etc.) al `bridge-agent` conectado, por un WebSocket separado
   (`/ws/bridge`, autenticado con `BRIDGE_TOKEN`, no con JWT de usuario).
3. `bridge-agent` reenvía el comando al ESP32 real y reenvía de vuelta
   cualquier cambio de estado, que `node` rebroadcastea a todos los
   navegadores conectados por el WS existente.
4. El firmware del ESP32 (`ESP32_relayController_V4.ino`, no versionado acá)
   tiene su propio backstop de seguridad (no deja poner Relay 3 en ON sin
   Relay 1 o 2 en ON), así que hay defensa en profundidad aunque alguien
   intente saltearse la API.

El historial de maniobras queda en la tabla `historial_relay` (reemplaza al
viejo mecanismo de archivos `app/Acciones/*.txt`, que se retiró).

## Telemetría del inversor

El bot Python viejo (`pyautogui` scrapeando el portal del DTU) se reemplazó
por un script externo (no vive en este repo) que empuja los datos por HTTP a
`POST /api/telemetry/inversor`, autenticado con `INGEST_API_KEY` (header
`X-Api-Key`). Reemplaza a la vieja importación de Excels
(`importar_excel_dtu.php`, retirado). El `bridge-agent` hace lo mismo para la
irradiancia/temperatura vía `POST /api/telemetry/irradiancia`.

---

## Flujo obligatorio para cualquier tarea

```
1. Implementar en local (/home/oscarin/prog/laburo/LabVirtualUNNE)
2. Verificar en local:
     docker compose up -d --build
     curl http://127.0.0.1:8155/login
3. rsync a VPS Contabo (producción)
4. Deploy en VPS (build + up)
5. Verificar en VPS (https://labvirtualunne.linkgestion.com)
6. Commit + push SIEMPRE desde la VPS (no desde local)
```

## Accesos operativos

| Recurso | Valor |
|---|---|
| Local | `/home/oscarin/prog/laburo/LabVirtualUNNE` |
| VPS Contabo (producción) | `root@62.171.190.54` pass: `Grupogon2025` path: `/root/linkgestion/labvirtualunne` (a definir en el primer deploy) |
| Dominio público | `https://labvirtualunne.linkgestion.com` |
| Traefik | Compartido con `prueba1` (misma VPS), red `prueba1_traefik-public`, certresolver `letsencrypt` |
| MySQL contenedor | `labvirtualunne_mysql` — credenciales en `.env` |

## Comandos de uso frecuente

```bash
cd /home/oscarin/prog/laburo/LabVirtualUNNE
docker compose up -d --build
docker compose logs -f node
docker compose logs -f php
```

---

## Qué falta para el primer deploy real

- Completar `.env` (copiar de `.env_EJEMPLO`): `MYSQL_ROOT_PASSWORD`,
  `DB_USER`/`DB_PASSWORD`, `JWT_SECRET`/`JWT_EXPIRATION`/`JWT_COOKIE_EXPIRES`,
  `BRIDGE_TOKEN` e `INGEST_API_KEY` (generar ambos con `openssl rand -hex 32`).
- Instalar y correr `bridge-agent/` en una PC de la facultad con salida a
  internet y visibilidad de red a los dos ESP32 (ver `bridge-agent/README.md`).
- Configurar el script de extracción del DTU para que empuje a
  `POST https://labvirtualunne.linkgestion.com/app/api/...` — en realidad al
  endpoint de Node: `POST https://labvirtualunne.linkgestion.com/api/telemetry/inversor`
  con header `X-Api-Key: <INGEST_API_KEY>`.
- Confirmar que el DNS de `labvirtualunne.linkgestion.com` sigue apuntando a
  la VPS Contabo (`62.171.190.54`) antes de levantar el stack.

## Pendiente (fuera de esta ronda)

- No hay usuario admin inicial: crear uno a mano contra `POST /api/register`
  (o insertando en la tabla `usuarios`) tras el primer `docker compose up`.
- La app/pages/admin/informacion.html y app/public/informacion.js siguen
  vacíos (pantalla planificada y nunca construida, ver `ANALISIS_PROYECTO.md`).
