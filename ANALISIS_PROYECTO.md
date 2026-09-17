# Análisis del proyecto — LabVirtualUNNE

> Documento generado por análisis de solo lectura del repositorio (sin cambios de código).
> Repo: `https://github.com/SamHman/LabVirtualUNNE.git` · Rama `main` · Último commit: 2026-09-11.

---

## 1. Qué es el proyecto

**LabVirtualUNNE es un laboratorio *remoto* (no simulado) de energía solar fotovoltaica**, desarrollado para la UNNE (Universidad Nacional del Nordeste, Argentina). La hipótesis del nombre se confirma con evidencia directa del código: el logo institucional `app/public/images/UNNE_logo.png` en el encabezado, el título de la pantalla principal (`<h1>Laboratorio Remoto</h1>` en `app/pages/admin/SCADA.html`), la zona horaria fijada en `America/Argentina/Buenos_Aires` y la mención explícita al "servidor del GER" (Grupo en Energías Renovables) en `app/api/Descripción.txt`.

El sistema permite a un usuario autenticado **operar físicamente, desde el navegador, una instalación solar real**: paneles fotovoltaicos, un inversor GoodWe y tres relés controlados por un ESP32/ESP8266. La pantalla principal es un **SCADA** (diagrama unifilar interactivo) donde cada relé se enciende o apaga con un click, con reglas de seguridad eléctrica implementadas en software para impedir maniobras peligrosas (por ejemplo, desconectar la continua antes que la alterna). En paralelo, el sistema **registra y grafica en tiempo real** las variables eléctricas del inversor (tensiones/corrientes PV y AC, frecuencias, potencia, energía) y las ambientales (temperatura e irradiancia medidas por un sensor ESP32 propio), y permite **exportar cualquier ventana temporal a Excel**.

El público objetivo son docentes/investigadores y alumnos del área de energías renovables: es una herramienta didáctica y de investigación, no un producto comercial. La instalación es **on-premise y de red local** (corre sobre XAMPP en una PC con Windows en la red de la facultad, IPs `10.40.x.x`), no está pensada para internet público.

---

## 2. Stack tecnológico

Es un stack **híbrido y poco convencional**: conviven dos backends (Node y PHP) sobre la misma base de datos MySQL, más una capa de automatización en scripts `.bat` de Windows y bots de Python externos al repo.

| Capa | Tecnología | Detalle |
|---|---|---|
| Backend web / auth | **Node.js + Express 4** (ESM, `"type": "module"`) | `app/index.js`, puerto 4000. Sirve las páginas, hace login/registro (JWT en cookie) y expone un WebSocket server. |
| Backend de datos | **PHP 8 sobre Apache/XAMPP** | 14 endpoints en `app/api/*.php`. Toda la lectura de series históricas, importaciones, combinaciones y exportación a Excel. |
| Base de datos | **MySQL / MariaDB** (`labvirtual`) | Accedida por `mysql2/promise` desde Node y por PDO desde PHP. Sin ORM ni migraciones. |
| Frontend | **HTML + CSS + JS vanilla** (sin framework ni build) | `app/public/SCADA.js` (2073 líneas) concentra casi toda la lógica de cliente. |
| Librerías de front (CDN) | **Chart.js** (jsdelivr), **Boxicons** (unpkg) | Cargadas por `<script>`/`<link>` directo, sin versión pineada. |
| Tiempo real | **WebSockets** en dos direcciones distintas | `ws` (Node) servidor→navegador; y el navegador/PHP como *cliente* del WebSocket del ESP32 (puerto 81). |
| Hardware | **ESP32 / ESP8266**, inversor **GoodWe**, **DTU** | Relés vía WS puerto 81; sensor de irradiancia/temperatura vía WS; datos del inversor vía archivos Excel/CSV del DTU. |
| Gestores de paquetes | **npm** (`package.json`) y **Composer** (`composer.json`) | Ambos con lockfile commiteado. |
| Librerías PHP | `phpoffice/phpspreadsheet ^5.1`, `vlucas/phpdotenv ^5.6` | Generación/lectura de Excel y carga de `.env`. |
| Automatización | **Batch de Windows** (`scripts/*.bat`) + **PowerShell** puntual | Ciclo maestro cada 300 s, arranque de servicios, TaskKill. |
| Bots externos | **Python + pyautogui** | `main.py` e `instabot.py` en `D:\xampp\htdocs\BOTGOODWE` — **no están en este repo**. |
| Deploy / CI | **Ninguno** | No hay Dockerfile, docker-compose, ni GitHub Actions. Deploy = copiar a `D:\xampp\htdocs\LabVirtualUNNE`. |

---

## 3. Estructura de carpetas

```
LabVirtualUNNE/
├── package.json / package-lock.json   # Node: express, ws, mysql2, jwt, bcryptjs
├── composer.json / composer.lock      # PHP: phpspreadsheet, phpdotenv
├── .env_EJEMPLO                       # plantilla de variables (JWT_*, DB_*, DB2_*)
├── .htaccess                          # Options -Indexes (raíz)
├── SEGURIDAD.md                       # documento de endurecimiento con .htaccess/CORS
├── LOGS_DEBUGGING_GUIDE.md            # catálogo de todos los archivos de log del sistema
├── DIAGNOSTICO_EXPORTACION.md         # bitácora de dos bugs resueltos (bat + export Excel)
│
├── app/
│   ├── index.js                       # ENTRY POINT Node: Express + WebSocketServer, rutas
│   ├── db.js                          # pool mysql2, carga .env, test de conexión al importar
│   │
│   ├── controllers/
│   │   ├── authentication.controller.js   # login / register (bcryptjs + JWT en cookie)
│   │   ├── data.controller.js             # inserts de inversor/irradiancia + lectura experimento
│   │   └── privileges.controller.js       # sistema de privilegios temporales — DESACTIVADO
│   ├── middlewares/
│   │   └── authorization.js               # soloAdmin / soloPublico (verifica cookie jwt)
│   │
│   ├── pages/
│   │   ├── login.html · register.html
│   │   └── admin/
│   │       ├── SCADA.html             # PANTALLA PRINCIPAL: unifilar + gráfico + modales
│   │       └── informacion.html       # ARCHIVO VACÍO (0 líneas)
│   │
│   ├── public/                        # servido como estático por Express
│   │   ├── SCADA.js                   # 2073 líneas — núcleo del frontend
│   │   ├── styleSCADA.css             # 1528 líneas
│   │   ├── login.js · register.js · style.css
│   │   ├── informacion.js             # ARCHIVO VACÍO (0 líneas)
│   │   └── images/                    # Paneles, Disyuntor, Relay_ON/OFF, Inverter_ON/OFF/FAULT
│   │
│   ├── api/                           # BACKEND PHP (corre bajo Apache, NO bajo Node)
│   │   ├── cors_config.php            # headers CORS compartidos
│   │   ├── obtener_datos_inversor.php      # GET series del inversor (?limit=)
│   │   ├── obtener_datos_irradiancia.php   # GET series del sensor (?limit=)
│   │   ├── crear_orden_relay.php           # POST: registra la maniobra en OrdenRelay.txt
│   │   ├── crear_fault_relay.php           # POST: espera 320 s y crea InversorFault.txt
│   │   ├── flag_bot_trabajando.php         # GET: ¿el bot está trabajando? (0/1)
│   │   ├── guardar_datos.php               # POST del sensor (variante PHP del ingest)
│   │   ├── sensor_websocket_service.php    # SERVICIO CLI: cliente WS del ESP32 24/7
│   │   ├── importar_excel_dtu.php          # importa .xls del DTU → datos_inversor
│   │   ├── importar_csv_fault.php          # importa CSV de interrupciones → datos_fault
│   │   ├── combinar_datos_fault_inversor.php # fusiona datos_fault dentro de datos_inversor
│   │   ├── exportar_datos_dashboard.php    # POST {start,end} → devuelve .xlsx
│   │   └── diagnostico*.php (x3)           # herramientas de diagnóstico de huecos de datos
│   │
│   └── Acciones/                      # "buzón" de archivos entre la web y los .bat
│       ├── OrdenRelay.txt             # bandera consumida (y borrada) por ciclo_automatizado
│       ├── RegistroDeAcciones/OrdenRelay.txt   # copia histórica (auditoría de maniobras)
│       └── BotFuncionando/estado_bot.txt      # Funcionando=0/1 escrito por el bot Python
│
├── scripts/                           # automatización Windows
│   ├── ciclo_automatizado.bat         # ORQUESTADOR: loop infinito de 300 s
│   ├── run_bot.bat · run_instabot.bat # lanzan los bots Python de BOTGOODWE (venv + pyautogui)
│   ├── ejecutar_importacion_dtu.bat / _csv_fault.bat / _combinacion_fault_inversor.bat
│   ├── ejecutar_sensor_service.bat    # arranca sensor_websocket_service.php con php.exe
│   ├── iniciar_servidor.bat           # arranca MySQL + npm install + nodemon
│   ├── diagnosticar_conexion_esp32.bat
│   ├── TaskKill_*.bat                 # matan por PID vía wmic
│   └── ContadorCicloAutomatizado/LAST_COUNT.tmp  # persistencia del contador
│
├── sql/                               # DDL manual (no hay migraciones)
│   ├── crear_tabla_datos_inversor.sql · crear_tabla_datos_fault.sql
│   ├── create_datos_experimento.sql · update_usuarios_table.sql
│   ├── add_unique_index_datos_inversor.sql · check_data.sql
│
└── logs/                              # vacío en el repo (solo .htaccess de bloqueo)
```

---

## 4. Cómo funciona

### 4.1 Flujo del usuario final

1. Entra a `http://<host>:4000/login`, ingresa usuario y contraseña.
2. Node valida contra la tabla `usuarios` (hash bcrypt) y devuelve una **cookie `jwt`**.
3. Es redirigido a `/SCADA` — la única pantalla real del sistema. Ahí ve:
   - **Diagrama unifilar interactivo**: paneles → disyuntores → Relay 1 / Relay 2 / Relay 3 → inversor → salida alterna. Cada relé es una imagen clickeable con estado ON / OFF / Desconectado.
   - **Gráfico en tiempo real** (Chart.js) con las variables del inversor e irradiancia; se puede expandir en un modal.
   - **Panel de datos** con los últimos valores numéricos.
   - **Reloj de Argentina** sincronizado contra el servidor.
   - **Botón "Exportar Excel"** que abre un modal de rango de fechas (máximo 7 días).
4. Al clickear un relé, el navegador abre un WebSocket **directo al ESP32** (`ws://10.40.131.223:81/`) y le manda `relay_on1` / `relay_off2`, etc. El comando **no pasa por ningún backend**: la web habla con el hardware.
5. En paralelo, avisa a `crear_orden_relay.php` para dejar registro de la maniobra.

### 4.2 Reglas de seguridad eléctrica (lógica de negocio central)

Antes de enviar cualquier comando, `relayManager` en `SCADA.js` aplica tres validaciones encadenadas. Es la parte más "de dominio" del proyecto:

- **`checkCommissioningManeuver`** — no se puede encender el Relay 3 (conexión a la alterna) si no hay antes alimentación de continua (R1 o R2 en ON). Mensaje: *"No se puede conectar el Inversor a la Alterna sin previamente la Alimentación de Continua"*.
- **`checkEmergencyManeuver`** — no se puede cortar la continua dejando la alterna conectada. Mensaje: *"Debes primero desconectar la Alterna"*.
- **`checkDisconnectionManeuver`** — protección del "Modo Caracterización": bloquea combinaciones que apagarían el inversor. Mensaje: *"No está permitido apagar el Inversor"*.

Además hay un **cooldown de 5 s por botón** y los relés se inicializan en estado `on` porque están cableados al **terminal normalmente cerrado**. El inversor no tiene control propio: su estado (ON / FAULT / OFF) se **deriva** de la combinación de los tres relés — si el Relay 3 está OFF se pinta como FAULT.

### 4.3 De dónde salen los datos

Hay **tres fuentes distintas** que alimentan la base:

| Fuente | Camino | Tabla destino |
|---|---|---|
| **Sensor ESP32** (temperatura + irradiancia) | `sensor_websocket_service.php` corre como proceso CLI 24/7, se conecta a `ws://10.40.131.230:81/`, hace el handshake WebSocket a mano sobre un socket TCP crudo y hace INSERT directo. Reconecta cada 5 s, intentos "infinitos". | `datos_irradiancia` |
| **Inversor GoodWe (operación normal)** | Un bot Python con `pyautogui` (`BOTGOODWE/main.py`, fuera del repo) descarga los Excel mensuales del portal del DTU a `D:\xampp\htdocs\mediciones\`. Luego `importar_excel_dtu.php` los parsea con PhpSpreadsheet por lotes y los inserta. | `datos_inversor` |
| **Inversor (eventos de falla)** | `instabot.py` genera CSV de interrupciones en `mediciones/Interrupciones/`; `importar_csv_fault.php` los carga y `combinar_datos_fault_inversor.php` los fusiona (con filtrado de valores absurdos: 999.99, 9999.99, 8426, 8516, 202510). | `datos_fault` → `datos_inversor` |

### 4.4 El ciclo automatizado (el "cron" del sistema)

`scripts/ciclo_automatizado.bat` es un **loop infinito de 300 segundos** que actúa como scheduler casero y es el pegamento de toda la arquitectura:

- Cada segundo chequea si existe `app/Acciones/OrdenRelay.txt` o `InversorFault.txt`.
- **Si aparece una bandera** (alguien operó un relé o se detectó un fault) → interrumpe el conteo y corre la **sub-rutina de FAULT**: `run_instabot.bat` → `ejecutar_importacion_csv_fault.bat` → `ejecutar_combinacion_fault_inversor.bat`. Luego borra las banderas.
- **Si el conteo llega a 300 sin banderas** → corre la **línea normal**: `run_bot.bat` → `ejecutar_importacion_dtu.bat`.
- Persiste el contador en `LAST_COUNT.tmp` para sobrevivir reinicios.

La comunicación entre la web y este scheduler es **por archivos de texto en disco**, no por cola ni base de datos. `flag_bot_trabajando.php` lee `estado_bot.txt` y `LAST_COUNT.tmp` para decirle al frontend cuántos segundos falta para que los datos se actualicen (150 s si el bot trabaja, 90 s si no).

Caso curioso: `crear_fault_relay.php` implementa un temporizador **bloqueando el proceso PHP con `sleep(320)`** (con `ignore_user_abort(true)` y `set_time_limit`), y recién entonces crea `InversorFault.txt`. Es un "cron diferido" implementado como request HTTP colgada.

### 4.5 Modelos de datos

Cuatro tablas, sin claves foráneas ni relaciones:

- **`usuarios`** — `user`, `password` (bcrypt, salt de 5 rounds), `privilegios` (BOOLEAN), `privilegios_expira` (DATETIME). Las dos últimas se agregan con `update_usuarios_table.sql`.
- **`datos_inversor`** — 18 campos eléctricos (`Vpv1/2`, `Ipv1/2`, `Vac1/2/3`, `Iac1/2/3`, `Fac1/2/3`, `Pac`, `EnergyToday`, `EnergyTotal`, `HourTotal`) + `fecha_hora`, `archivo_origen`, `fecha_importacion`. Único por `(fecha_hora, archivo_origen)`.
- **`datos_fault`** — estructura idéntica a `datos_inversor`; buffer para los eventos de interrupción antes de fusionarse.
- **`datos_irradiancia`** — `fecha_hora`, `temperatura`, `irradiancia`.
- **`datos_experimento`** — tabla "unificada" (inversor + irradiancia en una fila, único por `fecha_hora`). **La usa el backend Node y el WebSocket, pero el frontend ya no la consume**: `SCADA.js` pasó a leer las dos tablas por separado desde PHP y mezclarlas en el cliente (`mergeByNearestSensor`). Es un resto de una arquitectura anterior.

### 4.6 Rutas y endpoints

**Node (puerto 4000)** — `app/index.js`:

| Ruta | Método | Protección | Qué hace |
|---|---|---|---|
| `/` y `/SCADA` | GET | `soloAdmin` | Sirve `SCADA.html` |
| `/login`, `/register` | GET | `soloPublico` | Sirve los formularios |
| `/api/login`, `/api/register` | POST | — | Auth con JWT en cookie |
| `/api/obtener_datos_experimento.php` | GET | `soloAdmin` | Últimos N registros de `datos_experimento` |
| `/api/inversor`, `/api/irradiancia` | POST | `soloAdmin` | Inserts manuales |
| `/api/save-sensor-data` | POST | **ninguna** | Ingest del ESP32 |
| `/api/check-privileges`, `/api/grant-privileges`, `/api/revoke-privileges` | — | — | **Comentadas** en `index.js` |
| WebSocket `ws://host:4000` | — | ninguna | Broadcast de `datos_experimento` cada 3 min a todos los clientes |

**PHP (puerto 80, ruta `/LabVirtualUNNE/app/api/...`)** — los que consume el frontend: `obtener_datos_inversor.php`, `obtener_datos_irradiancia.php`, `crear_orden_relay.php`, `crear_fault_relay.php`, `flag_bot_trabajando.php`, `exportar_datos_dashboard.php`. **Ninguno verifica la cookie JWT.**

---

## 5. Cómo correrlo localmente

El proyecto está atado a **Windows + XAMPP**. Correrlo en Linux requiere adaptaciones no triviales (rutas `D:\...` hardcodeadas, `.bat`, `php.exe`).

### Requisitos
- XAMPP (Apache + PHP 8 + MySQL/MariaDB) instalado, con el proyecto en `D:\xampp\htdocs\LabVirtualUNNE`.
- Node.js (>= 16, por ESM y `ws` 8).
- Composer.
- Opcional: Python 3 + los bots en `D:\xampp\htdocs\BOTGOODWE`.

### Pasos

```bash
# 1. Dependencias
npm install
composer install

# 2. Crear el .env a partir de la plantilla
cp .env_EJEMPLO .env     # y completar JWT_SECRET, JWT_EXPIRATION,
                         # JWT_COOKIE_EXPIRES, DB_HOST/USER/PASSWORD/NAME

# 3. Base de datos (desde phpMyAdmin o mysql CLI), en este orden:
#    sql/crear_tabla_datos_inversor.sql   (crea la DB `labvirtual`)
#    sql/crear_tabla_datos_fault.sql
#    sql/create_datos_experimento.sql
#    sql/update_usuarios_table.sql
#    La tabla `usuarios` NO tiene script de creación propio — hay que crearla a mano
#    (id, user, password) antes de ejecutar update_usuarios_table.sql.

# 4. Arrancar el backend Node
npm run dev              # nodemon app/index.js → http://localhost:4000
```

En Windows, `scripts\iniciar_servidor.bat` hace los pasos 1 y 4 automáticamente e intenta levantar el servicio de MySQL.

### Servicios de fondo (opcionales, para que entren datos)

```cmd
scripts\ejecutar_sensor_service.bat    :: cliente WebSocket del sensor ESP32
scripts\ciclo_automatizado.bat         :: loop maestro de 300 s (bots + importaciones)
```

### Advertencia importante
Apache **debe** estar sirviendo el proyecto en el puerto 80, porque el frontend construye las URLs de PHP como `${protocol}//${hostname}/LabVirtualUNNE/app/api/...` (sin puerto). Con solo Node corriendo, la página carga pero **no muestra datos ni exporta**.

### Despliegue
No hay pipeline. El despliegue consiste en copiar la carpeta a `htdocs` del servidor Windows del laboratorio y dejar corriendo los `.bat`. Todo el endurecimiento documentado en `SEGURIDAD.md` se hace con archivos `.htaccess` de Apache.

---

## 6. Estado del repo

- **4 commits en total**, todos de septiembre de 2026, todos del mismo autor (`SamHman` / `Charly_Sam20`, el mismo email de GitHub). El primero, `807b36a "Commit inicial: Lab Virtual UNNE"`, subió el proyecto entero de una sola vez; los otros tres son ruido de setup (`Test commit: verify gh + git setup`, su reversión, y el `.htaccess` de `logs/`).
- **No hay historial real de desarrollo**: el proyecto se desarrolló durante 2025 (las fechas dentro de los archivos van de julio de 2025 a marzo de 2026) y recién después se puso bajo git. Una sola rama `main`, sin tags, sin PRs, sin issues visibles desde el repo.
- **Working tree limpio**, sin cambios pendientes.
- **No hay README, LICENSE ni CHANGELOG.** La documentación existente (`SEGURIDAD.md`, `LOGS_DEBUGGING_GUIDE.md`, `DIAGNOSTICO_EXPORTACION.md`) es buena y detallada, pero es documentación *operativa/de troubleshooting*, no de onboarding: ninguna explica qué es el proyecto ni cómo instalarlo desde cero.
- **Madurez**: es un proyecto **funcional y en uso real**, no un prototipo. El registro `app/Acciones/RegistroDeAcciones/OrdenRelay.txt` muestra ~130 maniobras reales de relés entre octubre de 2025 y **marzo de 2026**, lo que confirma operación sostenida. Pero es claramente software de laboratorio universitario: un solo autor, sin tests, sin CI, sin abstracciones, y con el entorno de producción hardcodeado en el código.
- **Cosas a medio hacer detectadas:**
  - `app/pages/admin/informacion.html` y `app/public/informacion.js` están **vacíos (0 bytes)** — una pantalla planificada y nunca construida.
  - El **sistema de privilegios** (`privileges.controller.js`, 185 líneas, con expiración a 48 h) está completo pero **sus tres rutas están comentadas** en `index.js`. El comentario explica la intención: *"Se diseñó en caso de que múltiples usuarios quisieran utilizar el laboratorio remoto a la vez"*. En `SCADA.js` quedó el comentario *"Verificación de privilegios eliminada - Todos los usuarios tienen acceso completo"*.
  - Aun así, `SCADA.js` **sigue llamando a `/api/check-privileges`** (que ya no existe) solo para leer el nombre de usuario del header; falla siempre en silencio y cae al fallback `'Usuario'`. Es un bug menor pero visible.
  - La tabla `datos_experimento` y la ruta `/api/obtener_datos_experimento.php` quedaron como arquitectura muerta: el WebSocket de Node las sigue usando, pero solo como *señal* de "hay datos nuevos" — el frontend ignora el payload y redescarga todo desde PHP.
  - `diagnostico.php` tiene un TODO explícito en su cabecera: *"adaptarla porque ahora sacamos datos de dos tablas"*.
  - `app/api/Descripción.txt` admite: *"esto funcionaba en mi compu, revisar eventualmente si funciona en el servidor del GER"*.
  - `scripts/README_NUEVOS_BAT.md` documenta tres `.bat` que **no están en el repo** (`configurar_firewall_websocket.bat`, `ejecutar_sensor_service_background.bat`, `detener_sensor_service.bat`).

---

## 7. Observaciones y riesgos

### Seguridad

1. **No hay credenciales hardcodeadas en el repo.** El `.env` está correctamente en `.gitignore` y no fue commiteado; solo existe `.env_EJEMPLO` con los nombres de las variables vacíos. Buen punto.
2. **Los fallbacks de credenciales sí son un riesgo**: tanto `app/db.js` como *todos* los endpoints PHP caen por defecto a `user=root` con **password vacía** si falta el `.env`. Es el patrón XAMPP por defecto y silencia el error de configuración en vez de fallar ruidosamente.
3. **Los endpoints PHP no tienen autenticación alguna.** Node protege sus rutas con el middleware JWT, pero `obtener_datos_inversor.php`, `exportar_datos_dashboard.php`, `crear_orden_relay.php` y `crear_fault_relay.php` responden a cualquiera que pueda alcanzar el puerto 80. La única barrera es la red local.
4. **CORS totalmente abierto**: `cors_config.php` emite `Access-Control-Allow-Origin: *`. Esto **contradice directamente** lo que documenta `SEGURIDAD.md`, que describe una lista blanca de orígenes (`localhost`, `10.x.x.x`, `192.168.x.x`). El documento describe una versión del archivo que ya no existe — su propio comentario dice *"Permite acceso desde cualquier origen para evitar problemas de CORS"*. Desactualización peligrosa: quien lea el `.md` creerá que hay una protección que no está.
5. **`/api/save-sensor-data` en Node no tiene ninguna protección** — cualquiera puede inyectar lecturas falsas de temperatura e irradiancia.
6. **Registro abierto**: `/register` permite crear cuentas sin aprobación ni verificación, y toda cuenta creada obtiene control total sobre hardware eléctrico real.
7. **Salt de bcrypt en 5 rounds** (`genSalt(5)`) — muy por debajo del mínimo recomendado (10-12).
8. **Sin `httpOnly`, `secure` ni `sameSite` en la cookie JWT** (`authentication.controller.js`), lo que la deja accesible desde JavaScript.
9. **Logging de headers completos** en `crear_orden_relay.php` y `crear_fault_relay.php`: escriben `getallheaders()` crudo al log, incluida la cookie JWT del usuario. Los logs están protegidos por `.htaccess`, pero es un token de sesión en texto plano en disco.
10. **Sin HTTPS.** Todo (incluidas las credenciales de login) viaja en claro por la red de la facultad.

### Arquitectura y mantenibilidad

11. **Dos backends para una misma base de datos**, con responsabilidades partidas de forma arbitraria y sin una capa de acceso compartida. Node y PHP duplican la lógica de conexión, y PHP incluso reimplementa a mano el parseo del `.env` (`explode("=", $line, 2)`) en cada endpoint en vez de usar `phpdotenv`, que sí está instalado.
12. **IPs y rutas absolutas hardcodeadas** en varios lugares: `ws://10.40.131.223:81/` (relés) y `ws://10.40.131.230:81/` (sensor) en dos archivos distintos; `10.40.136.255:4000` como `DEV_API_HOST` en `SCADA.js`; y rutas `D:\xampp\htdocs\...` en `flag_bot_trabajando.php`, `importar_excel_dtu.php`, `importar_csv_fault.php`, `sensor_websocket_service.php` y todos los `.bat`. Mover el proyecto de máquina o cambiar la subred rompe el sistema en múltiples puntos a la vez.
13. **El path `/LabVirtualUNNE/` está incrustado en las URLs del frontend** — el proyecto solo funciona si vive en esa carpeta exacta dentro de `htdocs`.
14. **Las validaciones de seguridad eléctrica viven exclusivamente en el navegador.** Un usuario con la consola abierta puede saltearse `checkEmergencyManeuver` y compañía y hablar directo con el WebSocket del ESP32. Dado que se trata de una instalación eléctrica física, esto merece defensa en profundidad en el firmware del ESP32 (si no la tiene ya).
15. **`SCADA.js` con 2073 líneas** sin módulos ni separación de responsabilidades: config, reloj, WebSocket, Chart.js, modales, exportación, control de relés y notificaciones en un solo archivo.
16. **Dependencias npm declaradas y nunca usadas**: `mongoose` (~un ORM de MongoDB en un proyecto MySQL), `bootstrap` y `cors`. No se importan en ningún archivo. Peso muerto.
17. **`nodemon ^2.0.22` está desactualizado** (la línea actual es 3.x). `express ^4.18` y `bcryptjs ^2.4.3` también son versiones viejas, aunque sin vulnerabilidades conocidas críticas. Las dependencias PHP (PhpSpreadsheet 5.1, phpdotenv 5.6) están al día.
18. **Chart.js y Boxicons se cargan desde CDN sin versión pineada** (`cdn.jsdelivr.net/npm/chart.js`), lo que significa que un cambio mayor upstream puede romper el gráfico sin que nadie toque el código. Además, la app requiere internet para renderizar, aun siendo un sistema de red local.
19. **`crear_fault_relay.php` bloquea un worker de Apache durante 320 segundos** por cada invocación. Con pocos usuarios concurrentes esto puede agotar el pool de procesos PHP.
20. **Un error de mayúsculas latente**: `SCADA.js` referencia `images/Inverter_Fault.png`, pero el archivo en disco se llama `Inverter_FAULT.png`. En Windows (sistema de archivos case-insensitive) funciona; en cualquier servidor Linux la imagen de estado FAULT no cargaría.
21. **Inconsistencia de esquema en `guardar_datos.php`**: inserta en `datos_irradiancia` las columnas `(fecha, temperatura, irradiancia, fecha_importacion)`, pero el resto del sistema usa `fecha_hora` y no existe `fecha_importacion` en esa tabla. `obtener_datos_irradiancia.php` incluso hace un `SHOW COLUMNS` en runtime para detectar si la columna se llama `fecha` o `fecha_hora` — evidencia de que el esquema divergió y se parcheó con detección dinámica en vez de una migración.
22. **Sin tests de ningún tipo, sin linter, sin CI, sin migraciones de base de datos.** El DDL es un conjunto de scripts sueltos que hay que ejecutar en el orden correcto y a mano, y ninguno crea la tabla `usuarios`.
23. **Datos operativos commiteados**: `app/Acciones/RegistroDeAcciones/OrdenRelay.txt` (130+ líneas de maniobras reales) y `LAST_COUNT.tmp` están versionados. Son estado de runtime, no código.

### Lo que está bien hecho

- Manejo de errores y apagado limpio (`SIGINT`/`SIGTERM`, cierre de WebSockets, limpieza de intervalos) en `app/index.js`.
- Queries parametrizadas en todos lados (Node con `?`, PHP con PDO prepared statements) — **no se detectó ninguna vulnerabilidad de SQL injection**.
- Importación por lotes con filtrado de valores absurdos y control de duplicados vía índices únicos y `SELECT ... FOR UPDATE`.
- Documentación operativa (`LOGS_DEBUGGING_GUIDE.md`) genuinamente útil y poco común en proyectos de este tamaño.
- Las reglas de maniobra eléctrica están bien pensadas y con mensajes claros para el operador.
- `.env` correctamente excluido de git desde el primer commit.

---

## 8. Resumen

LabVirtualUNNE es un **laboratorio remoto de energía solar de la UNNE**, funcional y en uso real desde octubre de 2025 hasta al menos marzo de 2026, que permite operar relés físicos y monitorear un inversor GoodWe desde un SCADA web. Técnicamente es un híbrido Node.js + PHP sobre MySQL, con mucha automatización en `.bat` de Windows, comunicación entre componentes **vía archivos de texto en disco** y acoplamiento fuerte al entorno XAMPP de una máquina específica (`D:\xampp\htdocs`, IPs `10.40.x.x`).

Los riesgos principales no son de código sino de **superficie de exposición**: los endpoints PHP no autentican, el CORS está abierto, el registro es libre y las validaciones de seguridad eléctrica corren solo en el cliente. Todo eso es tolerable mientras el sistema viva en una LAN aislada — y deja de serlo el día que alguien lo exponga a internet. Si se quisiera modernizar, los tres pasos de mayor impacto serían: (1) unificar el backend en uno solo, (2) mover IPs y rutas a configuración, y (3) autenticar los endpoints PHP y validar las reglas de maniobra también del lado del ESP32.
