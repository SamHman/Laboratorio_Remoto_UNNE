# Plan de integración con PLAT-LR (API de Laboratorios Remotos)

> Documento de planificación. No implica código todavía — es la referencia para ejecutar la migración.

## 0. Objetivo

Eliminar el sistema de login/registro propio (tabla `usuarios`, bcrypt, JWT propio) y que **toda** la aplicación —landing (`informacion.html`), panel (`SCADA.html`/`SCADA.js`), APIs de datos, relés y telemetría del lado navegador— exija una sesión válida respaldada por un token emitido por PLAT-LR (regular o de experiencia). Sin token válido de PLAT-LR, no hay acceso a ninguna página.

## 1. Principio rector

**Un único gate, aplicado antes que nada:** cualquier request que no tenga una sesión con token PLAT-LR válido se redirige a "necesitás un link de acceso o iniciar sesión en PLAT-LR". No existen rutas públicas dentro de la app (la landing deja de ser pública).

Dos orígenes de sesión, ambos validados contra la API externa, nunca contra datos locales:

| Origen | Cómo llega | Endpoint de identidad | Tipo de token |
|---|---|---|---|
| Login regular | Formulario email/contraseña → `POST /auth/login` en PLAT-LR | `GET /users/me` | `access_token` + `refresh_token` |
| Token de experiencia | `?token=XXX` en la URL, puede llegar a **cualquier** ruta | `GET /experiences/shift/info` | solo `access_token` (sin refresh) |

## 2. Qué se elimina

- Tabla `usuarios` (o se repropone sin credenciales, ver sección 7).
- `bcryptjs` como dependencia de autenticación.
- Emisión de JWT propio (`jsonwebtoken.sign` en `login`).
- Endpoint `/api/register` (el alta de usuarios pasa a ser responsabilidad de PLAT-LR).
- La distinción actual `soloAdmin` / `soloPublico` tal como está (pensada para "logueado en mi sistema o no").

## 3. Qué se agrega

### 3.1 Middleware único de sesión (reemplaza `authorization.js` actual)

Se ejecuta **antes** de cualquier ruta, incluida la landing:

1. Si la URL trae `?token=XXX` → tratarlo como token de experiencia nuevo, guardarlo en sesión server-side, limpiar el query param, continuar.
2. Si hay sesión activa (cookie de sesión con id que mapea a datos guardados en el servidor):
   - Tipo `experience` → validar con `GET /experiences/shift/info`.
     - 200 → continuar, adjuntar `user` + `shift` a `req`.
     - 403 → turno fuera de horario, servir pantalla "tu turno no está activo ahora" (no redirigir a login, el problema es de horario, no de sesión).
     - 401 → token vencido, no hay refresh: limpiar sesión y pedir link nuevo.
   - Tipo `regular` → validar con `GET /users/me`.
     - 200 → continuar, adjuntar `user` a `req`.
     - 401 → intentar `POST /auth/refresh_token` una vez con el `refresh_token` guardado; si funciona, reintentar `GET /users/me`; si falla, limpiar sesión y redirigir a `/login`.
3. Si no hay sesión ni `?token=` → redirigir a `/login` (única ruta que puede quedar sin sesión, para mostrar el formulario).

Este middleware se monta global (`app.use`), no por ruta, para que ni la landing quede afuera.

### 3.2 Sesión del lado servidor

Como ya no hay JWT propio, se necesita un mecanismo de sesión (ej. `express-session` con store en memoria o Redis, según carga esperada). La cookie de sesión del navegador solo contiene un id opaco; el servidor guarda `{tipo, access_token, refresh_token?, user_info, shift_info?}` del lado propio. Esto evita exponer el `access_token` crudo de PLAT-LR en el navegador más de lo necesario (excepto el de experiencia, que ya viaja en la URL por diseño de PLAT-LR).

### 3.3 Capa de cliente HTTP hacia PLAT-LR

Un módulo (`services/platlr.js`) que centraliza:
- Base URL configurable por entorno (test/producción, ver sección 0 del PDF).
- Funciones: `login(email, password)`, `refreshToken(token)`, `getMe(token)`, `getExperienceShiftInfo(token)`, y las de catálogo/asignaciones que se necesiten después (`getShifts`, `patchAssignment`, etc.).
- Manejo uniforme de errores HTTP (401/403/500) para que el middleware y los controllers no dupliquen lógica de fetch.

### 3.4 Cuenta de servicio para escrituras

Independiente de la sesión del usuario. Variables de entorno nuevas (junto a las que ya existen tipo `JWT_SECRET`, `BRIDGE_TOKEN`):
- `PLATLR_BASE_URL`
- `PLATLR_SERVICE_EMAIL`
- `PLATLR_SERVICE_PASSWORD`

Un servicio (`services/platlrServiceAccount.js`) hace login una vez, cachea el `access_token` en memoria del proceso, y lo reusa para `PATCH /assignments/{assignment_id}` (marcar asistencia/nota) cuando corresponda, reintentando login ante un 401.

## 4. Cambios por archivo existente

| Archivo | Cambio |
|---|---|
| `app/controllers/authentication.controller.js` | Reescribir `login` para pegar contra PLAT-LR en vez de la tabla local. Eliminar `register`. `whoami` pasa a leer de la sesión ya validada por el middleware. |
| `app/middlewares/authorization.js` | Reemplazar `soloAdmin`/`soloPublico`/`revisarCookie` por el middleware único de la sección 3.1. `soloApiKey` (telemetría del ESP32/bridge) se mantiene igual, es un canal aparte. |
| `app/index.js` | Montar el middleware de sesión de forma global (antes de servir `informacion.html`, `login.html`, `SCADA.html`). Eliminar `/api/register`. Revisar `/api/relay/command` y demás rutas de escritura: mantienen su propia verificación de permisos (rol) además del gate de sesión. |
| `app/db.js` / tabla `usuarios` | Dar de baja si no se usa para nada más. Si se necesita guardar algo local vinculado al usuario de PLAT-LR (historial propio, preferencias), crear tabla nueva sin credenciales, indexada por el `id` (UUID) que devuelve PLAT-LR. |
| `app/pages/login.html`, `app/public/login.js` | El formulario sigue existiendo (login regular), pero el POST ya no va a una tabla local — el backend lo reenvía a PLAT-LR. |
| `app/pages/register.html`, `app/public/register.js` | Se eliminan del flujo de la app (alta de usuarios queda en PLAT-LR). |
| `app/pages/informacion.html` | Deja de ser pública: pasa a servirse detrás del middleware único, igual que SCADA. |

## 5. Diferenciación de permisos dentro de SCADA (no en el acceso)

El gate de sesión es el mismo para todos; lo que cambia es qué puede *hacer* cada quien una vez adentro:

- **Token de experiencia:** acceso de solo lectura frente a PLAT-LR. Las acciones de escritura hacia PLAT-LR (asistencia/nota) las hace la cuenta de servicio, nunca el token del alumno. Si la experiencia permite operar relés, esa decisión de negocio se valida en el propio backend (`relay.controller.js`) comparando el `shift`/`experience` recibido, no delegándolo al token del alumno.
- **Token regular:** el `role` que viene en `user_info` (docente/admin/alumno) determina qué botones/endpoints están habilitados. Esto se resuelve en los controllers de acción (`relay.controller.js`, `data.controller.js`), no en el middleware de sesión.

## 6. Manejo de expiración (resumen operativo)

- Regular: 401 → un intento de `refresh_token` → si falla, sesión limpia y redirect a `/login`.
- Experiencia: 401 → sin refresh posible, sesión limpia, pantalla de "pedí un link nuevo a tu docente".
- Experiencia: 403 en `GET /experiences/shift/info` → sesión sigue siendo válida como identidad, pero el turno no está activo ahora; no se destruye la sesión, se informa el estado.

## 7. Pendiente a decidir (no bloqueante para arrancar)

- Store de sesión: memoria de proceso (simple, se pierde en un restart) vs Redis (sobrevive restarts, mejor si hay varios turnos simultáneos).
- Si conviene cachear la validación (`GET /users/me` / `GET /experiences/shift/info`) por unos segundos para no pegarle a la API de PLAT-LR en cada request de WebSocket/polling del dashboard, o si se valida solo al cargar la página y se confía en la sesión local por el resto de la duración del turno.
- Qué pasa con el bridge on-prem y el ESP32 (`soloApiKey`): quedan fuera de este cambio, siguen autenticando por `X-Api-Key`/`BRIDGE_TOKEN`, no por sesión de usuario.

## 8. Orden de implementación sugerido

1. Módulo `services/platlr.js` (cliente HTTP) + variables de entorno nuevas.
2. Middleware único de sesión (sección 3.1) + store de sesión (`express-session`).
3. Reescribir `login` en `authentication.controller.js` contra PLAT-LR; eliminar `register`.
4. Montar el middleware global en `index.js`, sacar `informacion.html` de la lista de rutas públicas.
5. Ajustar `login.html`/`login.js` si cambia algo del contrato de respuesta.
6. Agregar manejo de `?token=XXX` en el middleware (puede llegar a cualquier ruta).
7. Cuenta de servicio + `PATCH /assignments/{assignment_id}` desde donde corresponda marcar asistencia.
8. Dar de baja tabla `usuarios` y dependencias de bcrypt/JWT propio una vez validado que todo pasa por PLAT-LR.
9. Pruebas manuales: login regular completo, acceso vía `?token=XXX` dentro y fuera de horario de turno, expiración de ambos tipos de token.
