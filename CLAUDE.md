# CLAUDE.md — Guía operativa para agentes IA en LabVirtualUNNE

> Leé esto entero antes de tocar cualquier archivo.

---

## Qué es este proyecto

**LabVirtualUNNE** es un laboratorio remoto (no simulado) de energía solar
fotovoltaica de la UNNE: un SCADA web que opera relés físicos y monitorea un
inversor GoodWe real, instalado en la facultad (red `10.40.x.x`).

Repo del usuario (`SamHman`/`Charly_Sam20`), dockerizado y desplegado en una
VPS compartida (Contabo, `62.171.190.54`) para exponerlo en
`https://labvirtualunne.linkgestion.com`. El hardware (un ESP32 de relés) se
queda físicamente en la LAN de la facultad — no es alcanzable desde la VPS.
**Ya no hay ESP32 de irradiancia/temperatura**: se descartó del proyecto
(decisión del usuario, 2026-09-25) — no reintroducir esa lógica sin que se
pida explícitamente. La irradiancia/temperatura ahora llega de un Google
Sheet (ver "Telemetría").

**Entorno de desarrollo local: Windows, XAMPP, `D:\xampp\htdocs\LabVirtualUNNE`**
(no Linux — si ves referencias a `/home/.../LabVirtualUNNE` en commits o docs
viejos, son de otra máquina/sesión y están desactualizadas).

Stack en Docker Compose (en la VPS):

| Servicio | Tecnología | Puerto local | Rol |
|---|---|---|---|
| `node` | Express + `ws` | `127.0.0.1:8155` | SCADA, login/JWT, WS de navegador, WS del bridge, control de relés, ingesta de telemetría |
| `php` | PHP 8 + Apache | interno | Endpoints de solo lectura/exportación (`obtener_datos_*.php`, `exportar_datos_dashboard.php`) |
| `mysql` | MySQL 8 | interno | Base `labvirtual` |
| `nginx` | nginx | — | Proxy público: `/app/api/` → `php`, todo lo demás → `node` |

Pieza que **no** vive en la VPS: `bridge-agent/`, un proceso Node standalone
que corre en una PC de la facultad, con visibilidad de red al ESP32 de relés.
Es el único que le habla directo; mantiene una conexión saliente autenticada
(`BRIDGE_TOKEN`) hacia `node` en la VPS, por `/ws/bridge`. Ver
`bridge-agent/README.md`. No entra en ningún `Dockerfile` (confirmado), así
que cambios ahí no requieren rebuild de la VPS, solo commit + push.

---

## Frontend: `app/public/SCADA.js` + `app/public/funciones/`

El dashboard se reescribió en módulos ES nativos (`<script type="module">`,
sin bundler), en `app/public/funciones/`. `SCADA.js` solo importa y llama:

- `session.js` — logout + `GET /api/whoami` (username en el header, decodifica
  el JWT de la cookie, no reactivar `check-privileges`, ese sistema se borró).
- `reloj.js` — reloj en hora Argentina, zona horaria forzada explícitamente.
- `config.js` — constantes + `API_PHP_BASE` (detecta si está en XAMPP puerto
  4000 → usa `/LabVirtualUNNE/app/api`, si no → `/app/api`, que es lo único
  que el nginx de la VPS manda a PHP).
- `notificaciones.js` — `showNotification` y `mostrarProgreso` (banner con
  spinner y cuenta regresiva, reusado por exportación y por el fault del inversor).
- `datos.js`, `panelDatos.js`, `graficos.js`, `modales.js`, `exportar.js`,
  `dashboard.js` — el dashboard completo (panel, gráficos con Chart.js
  `4.5.1` fijo, modal del gráfico, exportación a Excel, polling cada 30s).
  Distingue datos **promediados** (de la base, 1 por minuto) de datos
  **instantáneos** (en vivo tras una maniobra, nunca guardados): el panel
  muestra "Tipo de dato" y el gráfico los dibuja como puntos rojos aparte,
  que se retiran cuando llega el promedio de ese minuto.
- `relay.js` — control de relés contra `POST /api/relay/command` + WS de
  `relay_status` (no WS directo al ESP32 — ver abajo). Interlocks de
  seguridad duplicados acá solo para feedback instantáneo; el servidor es la
  fuente de verdad. Es el dueño del WebSocket: los mensajes
  `inversor_instantaneo` los reemite como evento `inversor-instantaneo` de
  `window`, que escucha `dashboard.js`.

Referencia de comportamiento viejo (sin trackear, no se sirve, **no copiar
tal cual**): `app/public/SCADA Copia_Seguridad.js`.

`styleSCADA.css` es legacy (tiene `.modal`/`.modal-content` duplicados,
`AllowOverride None` en el Apache de Docker hace que ni el `.htaccess` del
proyecto se aplique ahí). Estilos nuevos van en `SCADA.CSS`.

### Header, apilamiento (z-index) y `<main>` — cuidado si tocás esto

- `header` tiene `z-index:100`, por encima de `.dashboard-container`
  (`z-index:1`) — son hermanos con su propio contexto de apilamiento, y en
  un empate gana el que viene después en el DOM (`main`), por eso el
  header necesita un z-index más alto a propósito, no un empate.
- **`<main>` tiene que quedar cerrado explícitamente** (`</main>` antes de
  los `<div class="modal">`). Antes le faltaba el cierre y los modales
  quedaban como descendientes de `main` sin que se notara (el empate de
  z-index de arriba hacía que `main`, viniendo después, los pintara igual
  arriba del header). Al ponerle `z-index:100` al header ese empate se
  rompió y los modales empezaron a aparecer tapados por el header en vez
  de cubrir toda la pantalla — si reordenás el HTML, verificá que los
  `.modal` sigan siendo hermanos de `header`/`main`, no descendientes.
- Menú de usuario: `header h1` centrado con grid de 3 columnas
  (`1fr auto 1fr`), no con flex (así el ancho del username no lo corre).
  El logout es un desplegable (`funciones/session.js: initUserMenu()`,
  toggle por clic, cierra con clic afuera o Escape) en vez de un ícono
  suelto.
- Diagrama SCADA: se diseñó a mano en un lienzo fijo de 900x600
  (posiciones absolutas en píxeles). En vez de un segundo juego de
  coordenadas en `vw` por breakpoint (se desalineaba, no guardaba
  proporciones), `.scada-scale-wrapper` escala el lienzo completo con
  `transform:scale(calc(100cqw / 900px))` — el factor de escala lo calcula
  el propio CSS con *container query units*, sin escalones. Requiere
  navegadores 2022+ (Chrome 105+/Safari 16+/Firefox 110+). Los botones
  siguen siendo clickeables (transform no cambia el DOM).

---

## Arquitectura de control de relés

1. El navegador hace `POST /api/relay/command` a `node` (protegido con la
   cookie JWT de sesión, `soloAdmin`).
2. `app/controllers/relay.controller.js` re-valida las tres reglas de
   seguridad eléctrica contra un caché en memoria del estado de los relés
   (`relayStates`), y si pasan, reenvía el comando exacto (`relay_on1`, etc.)
   al `bridge-agent` conectado, por un WebSocket separado (`/ws/bridge`,
   autenticado con `BRIDGE_TOKEN`, no con JWT de usuario).
3. `bridge-agent` reenvía el comando al ESP32 real y reenvía de vuelta
   cualquier cambio de estado, que `node` rebroadcastea a todos los
   navegadores conectados por el WS general (`funciones/relay.js` del lado
   del navegador).
4. `relay_status` incluye `espConnected` (agregado 2026-09-25) para que el
   frontend sepa si el bridge/ESP32 están conectados sin depender de que un
   `POST` falle con 503.
5. El firmware del ESP32 (`ESP32_relayController_V5.ino`, no versionado acá)
   tiene su propio backstop de seguridad, así que hay defensa en profundidad.

El historial de maniobras queda en la tabla `historial_relay`.

**Advertencia de escalado a cluster** (si algún día se corre `node` en más
de una instancia): `bridgeSocket` y `relayStates` viven en memoria de un solo
proceso — con varias réplicas, solo una tendría al bridge-agent conectado.
Detalle completo en `NOTAS_CLUSTER.md` (sin trackear, notas del usuario).

---

## Telemetría

### Inversor — GoodWeReader (fuera del repo)

`goodwe_reader.py`, en la PC conectada por USB al inversor
(`E:\ProyectoFinal\CopiaDeSeguridad\22_09_2026\Pruebas\GoodweReader`, no
versionado acá). Lee cada 10 s y, por ventanas de reloj de
`AVERAGE_WINDOW_SECONDS = 60`, promedia cada campo sobre las lecturas que
realmente llegaron; ese promedio va al CSV mensual local (sin `raw_hex`) y a
`POST /api/telemetry/inversor` (`ingestInversor`, upsert por `fecha_hora`,
header `X-Api-Key` = `INGEST_API_KEY`, leída de `ingest_api_key.txt` al lado
del script). No tocar `FIELDS`/`decode_response` (calibración validada) ni
el chequeo `is_valid_response` (sumarle condiciones puede disparar
re-handshakes, y el inversor a veces no contesta el handshake aunque siga
mandando datos bien). Se arranca/detiene con `iniciar_lectura_inversor.bat` /
`detener_lectura_inversor.bat` (corren el `.py` con el Python del sistema; el
`.exe` de `dist/` está desactualizado).

**Datos instantáneos** (al maniobrar un relé): `relay.controller.js` llama a
`registrarManiobra()` (`app/services/maniobras.js`, marca en memoria). En cada
ciclo GoodWeReader consulta `GET /api/telemetry/inversor/evento-relay`; si la
marca cambió, durante `INSTANT_WINDOW_SECONDS = 30` manda cada lectura también
a `POST /api/telemetry/inversor/instantaneo`, que **no guarda nada**: solo la
reenvía por WS a los navegadores. Esas lecturas siguen contando para el
promedio del minuto. El Excel nunca lleva instantáneos.

### Irradiancia — Google Sheet

`app/services/irradianciaSync.js` corre dentro de `node`: cada
`IRRADIANCIA_POLL_INTERVAL_MS` lee el Sheet "DataLogger ESP32 - UNNE"
(columna A fecha, B irradiancia, C temperatura; sin encabezado; mezcla
formatos `YYYY-MM-DD` y `DD/MM/YYYY`) con una cuenta de servicio de solo
lectura y hace upsert de todo el rango en `datos_irradiancia`. Credencial en
`credentials/` (gitignorado, montado como volumen; copiarlo a mano a cada
máquina). En `datos_irradiancia` de la VPS hay 20 filas dummy previas
(2026-09-24 13:00–13:19) que no vienen del Sheet — sin decidir si se borran.

### Exportación a Excel

`exportar_datos_dashboard.php` (el anterior quedó como referencia en
`Modelo_exportar_datos_dashboard.php`, sin trackear): sin promediar, una fila
por lectura de `datos_irradiancia`, con el registro de `datos_inversor` más
cercano dentro de ±60 s (si no hay, celdas vacías). Si el rango no tiene
lecturas entrega las más cercanas antes/después (`datos_dashboard_cercanos_...`)
— **es intencional, no es un bug** (decisión del usuario).

**Endpoints legacy sin uso, en `app/controllers/data.controller.js`**
(`insertInversorData`, `insertIrradianciaData`, `saveSensorData`): ningún
código actual los llama. `saveSensorData` (`POST /api/save-sensor-data`)
además **no tiene middleware de autorización** — ver advertencia en el
propio archivo. Quedan para limpiar en una próxima sesión, no borrar sin
que el usuario lo pida explícitamente (ya está avisado y decidido dejarlo
para después).

---

## Decisiones ya tomadas — no las asumas como "a discutir"

- Sistema de privilegios (multiusuario con expiración) eliminado del todo.
  Tabla `usuarios`: solo `id, user, password, creado_en`.
- `datos_experimento` no se usa más — se sacó del backend (`app/index.js`,
  `data.controller.js`). La tabla sigue en `sql/init/04_datos_experimento.sql`,
  sin decidir si se borra.
- ESP32 de irradiancia/temperatura descartado del proyecto entero (frontend,
  bridge-agent, y los endpoints de ingesta correspondientes ya se sacaron).
- 4 PHP de diagnóstico + `cors_config.php` en `app/api/` se borraron (sin uso,
  alcanzables desde internet sin autenticación).
- El `.env` de la VPS está protegido por config de Apache (`Dockerfile.php`:
  `Options -Indexes` + `<Files ".env"> Require all denied`), no solo por
  permisos de archivo — no revertir esto.

---

## Flujo de trabajo con el usuario

- El usuario suele escribir código a mano en el editor mientras se conversa.
  Si un archivo cambia en disco sin que vos lo hayas tocado, asumilo como
  deliberado, no lo reviertas.
- Refactors grandes: explorar, armar un plan, presentarlo y esperar
  aprobación antes de escribir código extenso.
- Antes de borrar algo que parece sin uso, confirmar con grep que de verdad
  no lo llama nada (frontend, otros PHP, nginx) y explicar el hallazgo antes
  de borrar.
- Commit + push: se puede hacer desde esta PC o desde la VPS indistintamente
  (el usuario lo confirmó explícitamente) — **no** es cierto que deba hacerse
  siempre desde la VPS.
- Después de cada commit: taggear `deploy-ok-YYYY-MM-DD` (sufijo `-2`, `-3`...
  si hay más de uno el mismo día) y `git push --tags` (no `--follow-tags`,
  son tags livianos).

## Flujo de deploy a la VPS

Pushear a GitHub **no** deploya solo. Pasos manuales en la VPS:
```bash
ssh root@62.171.190.54   # clave SSH ya instalada, sin contraseña
cd /root/linkgestion/labvirtualunne
git pull
docker compose up -d --build
docker restart labvirtualunne_nginx   # gotcha: nginx cachea la IP interna vieja
                                       # de node/php si se recrean, tira 502 si no se reinicia
curl -I https://labvirtualunne.linkgestion.com/login   # esperar 200
```
La VPS es compartida (~70 contenedores de otros clientes) — tocar solo los
`labvirtualunne_*`. `bridge-agent/` no necesita este paso, no está en ningún
Dockerfile.

**Rollback:** `git reset --hard <tag-o-hash>` en la VPS (no toca GitHub) +
repetir los pasos de arriba.

## Accesos

| Recurso | Valor |
|---|---|
| Local | `D:\xampp\htdocs\LabVirtualUNNE` (Windows) |
| VPS | `root@62.171.190.54`, path `/root/linkgestion/labvirtualunne`. Acceso por clave SSH, ya instalada |
| Dominio público | `https://labvirtualunne.linkgestion.com` |
| MySQL VPS | contenedor `labvirtualunne_mysql`, BD `labvirtual` — credenciales en `.env` de la VPS (protegido, no pisar) |
| `.env` local | copiar de `.env_EJEMPLO`, completar con credenciales de XAMPP |

## Pendiente

- No hay usuario admin garantizado: crear uno contra `POST /api/register` si
  hace falta — **ojo:** esa ruta no tiene ningún control de acceso, cualquiera
  puede registrarse.
- `app/pages/admin/informacion.html` y `app/public/informacion.js` siguen
  vacíos (pantalla planificada, nunca construida — ver `ANALISIS_PROYECTO.md`).
- Limpiar los 3 endpoints legacy de `data.controller.js` (ver arriba).
- Zona horaria: MySQL de la VPS corre en UTC: sin `--default-time-zone=-03:00`,
  las columnas `fecha_importacion`/`creado_en` quedan 3h adelantadas.
