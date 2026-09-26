# Contexto de trabajo — Refactorización de SCADA.js

Este documento resume el estado de trabajo sobre el dashboard SCADA de LabVirtualUNNE, pensado para arrancar futuras conversaciones sin perder contexto. Está escrito hasta el punto en que se generó el plan de reconstrucción de `SCADA.js` (todavía no implementado).

## Proyecto y objetivo general

- El proyecto se va a desplegar en una VPS. Actualmente corre en local bajo XAMPP (Apache + PHP + MySQL) más un proceso Node/Express (`app/index.js`, puerto 4000, `npm run dev` → `nodemon --exec node app/index.js`).
- Los datos del inversor solar llegan desde un programa Python en `C:\Herramientas_Server\GoodweReader` (fuera del repo web). Antes se importaban también manualmente desde archivos Excel exportados por el software del inversor GoodWe.
- Los datos de irradiancia/temperatura llegan de un sensor ESP32 vía WebSocket.
- El control de relés (encender/apagar el inversor/paneles) se hace con un ESP8266/ESP32 aparte, también por WebSocket, pero **el navegador se conecta directo a una IP LAN privada** — ver "Deuda técnica" abajo.

## Modus operandi acordado con el usuario

- El usuario pregunta, el asistente responde. Solo se deben hacer modificaciones de código "profundas" (multi-archivo, refactors) cuando se pida explícitamente actuar como agente.
- Para reconstrucciones grandes (como esta), usar modo plan: explorar, diseñar, presentar el plan y esperar aprobación antes de tocar código.
- El usuario corrige fuerte cuando encuentra código que no pidió (ver caso `archivo_origen` abajo) — antes de tocar un archivo compartido por varias partes del sistema, avisar del impacto en vez de asumir.

## Trabajo ya realizado

### 1. Tabla `datos_inversor` (SQL)
- `sql/crear_tabla_datos_inversor.sql` tenía columnas `archivo_origen` y `fecha_importacion` que el usuario no pidió (venían de un uso anterior: importación manual de Excel). Se eliminaron ambas columnas de la tabla; ahora tiene exactamente las columnas que pidió el usuario, con `UNIQUE KEY unique_fecha_hora (fecha_hora)`.
- Como consecuencia, se actualizaron los dos scripts PHP que dependían de `archivo_origen`:
  - `app/api/importar_excel_dtu.php`: ya no inserta/filtra por `archivo_origen`; `getLastImportTime()` ahora usa `MAX(fecha_hora)` global de la tabla (válido porque `fecha_hora` es única).
  - `app/api/exportar_datos_dashboard.php`: se quitaron los 3 filtros `archivo_origen LIKE '%.xls'`.
- **No se tocó** `datos_fault` / `app/api/combinar_datos_fault_inversor.php` / `app/api/importar_csv_fault.php`: son una tabla y lógica distintas que sí siguen necesitando `archivo_origen` para su propio flujo.

### 2. Tabla `datos_irradiancia` (SQL)
- Ya existía y cumple exactamente lo pedido (`fecha_hora`, `irradiancia`, `temperatura`) en `sql/crear_tabla_datos_irradiancia.sql`. No requirió cambios.

### 3. Export a Excel: no hace falta tabla de unión
- `app/api/exportar_datos_dashboard.php` ya hace el JOIN de `datos_inversor` + `datos_irradiancia` al vuelo (agrupando en intervalos de 5 minutos, buscando el dato de irradiancia más cercano por timestamp). No hace falta una tabla intermedia para exportar a Excel.

## Pendiente de decisión (no resuelto todavía)

1. **Nombre de la base de datos para la VPS.** El usuario editó manualmente `sql/crear_tabla_datos_inversor.sql` línea 4, dejando `CREATE DATABASE IF NOT EXISTS labremoto` (sin `;`) seguido de `USE labvirtual;` — sintaxis inválida y nombre inconsistente. Se le preguntó si la base debe llamarse `labremoto` o `labvirtual` y **no respondió todavía** (cambió de tema). Falta confirmar y corregir ese archivo (y probablemente el resto de los scripts SQL/`.env` que asumen `labvirtual`).

2. **Destino de la tabla `datos_experimento`** (`sql/create_datos_experimento.sql`). Existe y hay endpoints que la leen (`data.controller.js` → `/api/obtener_datos_experimento.php`, pensado para un gráfico en tiempo real de las últimas 720 muestras), pero **no hay ningún INSERT hacia ella en todo el repo** — está vacía en la práctica, ese endpoint devuelve siempre 0 filas. Se le preguntó al usuario si quiere que se implemente el insert, se deje así, o se elimine, y **tampoco respondió esto todavía** (la conversación se desvió al tema de `archivo_origen`). Queda pendiente retomar.

## SCADA.js — estado y plan de reconstrucción

- `app/public/SCADA.js` está **vacío (0 bytes) a propósito**. El usuario lo vació para reconstruirlo desde cero con buenas prácticas (no fue un borrado accidental, aunque en su momento sí se detectó como posible pérdida de datos).
- Hay un backup exacto (mismo MD5) del código viejo funcionando (2073 líneas) en `app/public/NoES_SCADA2.js` y `app/public/SCADA Copia_Seguridad.js` (idénticos entre sí). **Usar como referencia de comportamiento a preservar, no para seguir usándolos.**
- El HTML fijo que dirige todo es `app/pages/admin/SCADA.html`, servido por Express en `/` y `/SCADA` (middleware `authorization.soloAdmin`), y ya carga el script como `<script type="module" src="/SCADA.js">` — o sea, **ya se pueden usar módulos ES nativos sin bundler** (no hay ninguno en el repo).

### Contrato de backend verificado (para no tener que re-explorarlo)

- `GET app/api/obtener_datos_inversor.php?limit=N&ultimo_timestamp=T` → `{status,success,data:[{fecha_hora,Vpv1,Vpv2,Ipv1,Ipv2,Vac1-3,Iac1-3,Fac1-3,Pac,EnergyToday,EnergyTotal,HourTotal,fecha_hora_formatted}],ultimo_timestamp,timestamp_actual,total_registros}`
- `GET app/api/obtener_datos_irradiancia.php?limit=N&ultimo_timestamp=T` → mismo shape con `{temperatura,irradiancia}`
- `POST app/api/exportar_datos_dashboard.php` body `{start,end}` → stream `.xlsx` (o JSON `{success:false,message}` en error)
- `POST app/api/crear_orden_relay.php` body `{relayNum,action:"ENCENDIDO"|"APAGADO",timestamp}` — logging de cada comando de relay
- `POST app/api/crear_fault_relay.php` (sin body) — se dispara cuando el relay 3 pasa a ON
- `GET app/api/flag_bot_trabajando.php` → `{Funcionando: 0|1}` — usado tras cada orden de relay para mostrar un banner de cuenta regresiva (150s si Funcionando=1, si no 90s) avisando cuánto tardará en reflejarse el cambio en el dashboard (porque los datos reales vienen del bot Python en su propio ciclo).
- **WebSocket de relés (ESP32/ESP8266):** el navegador se conecta DIRECTO a `ws://10.40.131.223:81/` (IP LAN). Comandos salientes en texto plano: `"relay_on"+N` / `"relay_off"+N` / `"get_status"` (N=1..3). Mensaje entrante JSON: `{relay1:"ON"|"OFF",relay2:"ON"|"OFF",relay3:"ON"|"OFF"}`. Mapeo: 1=`esp8266-top`, 2=`esp8266-bottom`, 3=`esp8266-right`. `goodwe-inverter` no tiene comando propio, su estado visual se deriva del estado de los relés.
- **WebSocket de Node** (mismo puerto que Express, 4000): solo avisa "hay datos nuevos" (`{type:"initial_data"|"data_update",...}`), el cliente reacciona re-pidiendo por HTTP los dos endpoints de arriba. Hay además un polling de respaldo cada 30s por si el WebSocket queda "zombie" (bug real ya resuelto así en el código viejo, hay que preservar el mecanismo).
- `/api/check-privileges`: implementado en `app/controllers/privileges.controller.js` pero **la ruta está comentada/deshabilitada en `app/index.js:180`** — hoy es un 404 muerto. El username del header dependía de esto.
- Logout (`#logout-icon`): 100% client-side, no llama al backend — borra la cookie `jwt` y redirige a `/`.
- Apache/PHP (`app/api/*.php`) y Node/Express corren juntos hoy bajo XAMPP en la misma máquina, pero por rutas distintas: PHP se sirve en `http://<host>/LabVirtualUNNE/app/api/...`, Node sirve el resto (`/`, `/SCADA`, su propio subconjunto de `/api/*`, y el WebSocket). No hay Dockerfile, pm2, ni ningún script de deploy para VPS todavía — hay que armarlo cuando llegue el momento.

### Decisiones tomadas para el rebuild

- Carpeta de módulos: **`app/public/funciones/`** (ya existe, vacía) — ahí van todos los módulos nuevos.
- Control de relés: se mantiene tal cual (IP LAN hardcodeada), aislado en su propio módulo `relay.js` para poder cambiarlo después sin tocar el resto. **Fuera de alcance resolver el problema de alcance VPS↔LAN ahora** (decisión explícita del usuario).
- Username/`check-privileges`: se descarta por completo, no se porta `fetchUserData`/`updateUsernameDisplay`. Falta el pequeño cambio de HTML: `SCADA.html:20` pasar de `<span id="header-username" class="username">Cargando...</span>` a `<span class="username">Panel de Control</span>` (sin esto, sin el JS quedaría trabado en "Cargando...").

### Plan completo de reconstrucción

El plan detallado (lista de módulos, responsabilidades, contenido exacto del nuevo `SCADA.js`, orden de construcción paso a paso, y checklist de verificación manual) fue generado y quedó guardado como borrador, pero el usuario todavía lo está revisando — **no se implementó nada todavía**. Si no está disponible en una conversación nueva, hay que regenerarlo (el contrato de backend y las decisiones de arriba ya alcanzan para reconstruirlo rápido). Resumen de los módulos previstos en `app/public/funciones/`:

`config.js`, `state.js`, `api.js`, `notifications.js`, `clock.js`, `modals.js`, `dataProcessing.js`, `dataPanel.js`, `chart.js`, `exportModal.js`, `deviceModal.js` (wiring nuevo: el código viejo nunca conectó los clicks de los bloques del diagrama a `#device-modal`), `relay.js` (puerto del objeto `relayManager` viejo, que ya era un buen patrón), `dataRefresh.js`. `SCADA.js` queda como punto de entrada único con un solo `DOMContentLoaded` que llama a los `init...()` de cada módulo en orden explícito.

Antipatrones del código viejo que este rebuild corrige: ~15 funciones anidadas dentro de un callback de 1200 líneas, 4 puntos de inicialización distintos, la misma llamada `fetch` a `obtener_datos_inversor.php`/`obtener_datos_irradiancia.php` copiada 3 veces, una constante `SERVER_UPDATE_INTERVAL` declarada pero nunca usada mientras el polling real hardcodea `30000` aparte, y variables globales sueltas (`userData`, `cachedData`, `relojInterval`, etc.).

## Deuda técnica conocida y aceptada (no resolver salvo que se pida)

- El control de relés no va a funcionar desde un navegador fuera de la LAN del laboratorio una vez que el frontend esté en la VPS pública (IP privada hardcodeada). Aceptado como pendiente para otra etapa.
- Nombre de base de datos sin definir (`labvirtual` vs `labremoto`) — ver "Pendiente de decisión" arriba.
- Destino de `datos_experimento` sin definir — ver "Pendiente de decisión" arriba.
