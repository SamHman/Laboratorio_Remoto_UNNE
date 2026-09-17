# Plan de integración — script extractor de datos del DTU

> El bot Python viejo (`pyautogui`, scrapeaba una pantalla) fue reemplazado por
> un script en Python que ya extrae los datos del DTU y corre en una
> computadora con acceso a internet (no necesariamente en la LAN de la
> facultad — el portal del DTU es accesible por internet, a diferencia de los
> ESP32 de relés/sensor, que sí están LAN-only y dependen de `bridge-agent/`).
> Este documento es el plan para conectar ese script con la API ya
> desplegada en `https://labvirtualunne.linkgestion.com`. No se tocó código
> del script en esta ronda porque vive fuera de este repo.

## 1. Contrato del endpoint destino (ya implementado y en producción)

- **URL**: `POST https://labvirtualunne.linkgestion.com/api/telemetry/inversor`
- **Auth**: header `X-Api-Key: <INGEST_API_KEY>` (middleware `soloApiKey` en
  `app/middlewares/authorization.js:47-51`). El valor real vive en el `.env`
  de la VPS (`/root/linkgestion/labvirtualunne/.env`), no está en este repo.
- **Content-Type**: `application/json`
- **Body** (`app/controllers/telemetry.controller.js:13-37`):

  ```json
  {
    "fecha_hora": "2026-09-17 14:32:00",
    "origen": "script-dtu",
    "Vpv1": 320.5, "Vpv2": 318.2,
    "Ipv1": 8.1,   "Ipv2": 8.0,
    "Vac1": 220.1, "Vac2": 219.8, "Vac3": 220.3,
    "Iac1": 12.4,  "Iac2": 12.3,  "Iac3": 12.5,
    "Fac1": 50.01, "Fac2": 50.01, "Fac3": 50.00,
    "Pac": 8150.0,
    "EnergyToday": 24.6,
    "EnergyTotal": 18342.1,
    "HourTotal": 12044.3
  }
  ```

  - `fecha_hora` es **obligatorio**, formato `YYYY-MM-DD HH:MM:SS` (hora local
    de Argentina, sin timezone — así se guarda en la columna `DATETIME`).
  - Los 17 campos eléctricos (`Vpv1, Vpv2, Ipv1, Ipv2, Vac1, Vac2, Vac3, Iac1,
    Iac2, Iac3, Fac1, Fac2, Fac3, Pac, EnergyToday, EnergyTotal, HourTotal`)
    son opcionales individualmente (si falta uno, se guarda `NULL`), pero
    deben mandarse todos los que el script tenga disponibles.
  - `origen` es opcional (default `"script-dtu"` si no se manda) — es solo
    texto libre para saber de qué proceso vino el dato, ya no identifica un
    archivo Excel como antes.
  - **Es upsert**: reenviar la misma `fecha_hora` dos veces actualiza la fila
    en vez de duplicarla (índice único sobre `fecha_hora`, ver
    `sql/init/02_datos_inversor.sql`) — el script puede reintentar sin miedo
    a generar duplicados.
  - Respuesta OK: `{"status":"ok","message":"Datos del inversor ingresados correctamente"}`
    (HTTP 200). Errores: `400` si falta `fecha_hora`, `401` si la API key es
    inválida/ausente, `500` si falla la DB.

### Prueba manual (para validar antes de tocar el script real)

```bash
curl -s -X POST https://labvirtualunne.linkgestion.com/api/telemetry/inversor \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <INGEST_API_KEY real, ver .env en la VPS>" \
  -d '{"fecha_hora":"2026-09-17 12:00:00","Pac":8150.0,"EnergyToday":24.6}'
```

Confirmar que aparece luego en `GET /app/api/obtener_datos_inversor.php?limit=5`
y en el export a Excel (`exportar_datos_dashboard.php`).

## 2. Cambios que necesita el script Python

No conocemos el código actual del script (vive fuera de este repo, en la
computadora que lo corre) — esto es lo que hay que confirmar/agregar cuando
se tenga acceso a él:

1. **Función de envío HTTP** — después de leer cada lectura del DTU, armar
   el JSON de arriba y hacer el POST (con `requests` en Python es una función
   de ~15 líneas: `requests.post(url, json=payload, headers={"X-Api-Key": ...}, timeout=10)`).
2. **La API key nunca hardcodeada** en el script — leerla de una variable de
   entorno (`INGEST_API_KEY`) o un archivo `.env` local en esa computadora,
   igual que se hizo para `bridge-agent/`.
3. **Manejo de fallos de red**: si el POST falla (VPS caída, sin internet un
   rato), el script no debe frenar su ciclo de lectura — loguear el error y
   seguir; como el endpoint es upsert por `fecha_hora`, no hay problema en
   reintentar más tarde con el mismo dato si el script guarda un buffer local
   (recomendado: si falla el POST, encolar la lectura en un archivo/lista y
   reintentar en el próximo ciclo antes de mandar la nueva).
4. **Timeout corto** (5-10s) en el POST para no bloquear el ciclo de lectura
   del DTU si la red está lenta.
5. Si el script hoy persiste los datos en algo local (CSV, SQLite, lo que
   sea) antes de este cambio, mantenerlo como respaldo local además de
   empujar a la API — no depender 100% de la red para no perder datos.

## 3. Dónde y cómo debe correr

- Sigue corriendo en la misma computadora con acceso a internet donde está
  hoy — **no hace falta LAN de la facultad** para esta pieza (a diferencia
  del `bridge-agent/`, que si necesita estar en esa LAN para hablarles a los
  ESP32). Si esa computadora *también* tiene visibilidad a los ESP32, se
  podría eventualmente correr junto con `bridge-agent/` en la misma máquina,
  pero no es un requisito.
- Reemplaza la programación que antes hacía `ciclo_automatizado.bat` +
  Task Scheduler de Windows para el bot viejo: el script Python debe tener su
  propio scheduling (loop propio con `sleep`, o Task Scheduler/cron apuntando
  a él), independiente de cualquier `.bat` — todos los `.bat` de este repo ya
  se retiraron (ver `CLAUDE.md`).
- Solo necesita: Python + `requests` (o el cliente HTTP que ya use) + salida
  HTTPS hacia `labvirtualunne.linkgestion.com` (puerto 443, sin necesidad de
  abrir nada del lado de esa computadora, es conexión saliente).

## 4. Seguridad

- El endpoint ya corre bajo HTTPS con certificado válido de Let's Encrypt
  (Traefik compartido) — no mandar nunca la API key por HTTP plano.
- La API key (`INGEST_API_KEY`) es el único control de acceso a este
  endpoint — tratarla como una contraseña: no commitear, no loguearla en
  texto plano en los logs del script.
- Si en algún momento se sospecha que la key se filtró, se regenera en el
  `.env` de la VPS (`openssl rand -hex 32`) y se reinicia el contenedor
  `node` — invalida la vieja al instante.

## 5. Lo que falta confirmar para cerrar esta integración

Esto requiere mirar el script real, que no está en este repo:

- ¿En qué formato/unidades entrega hoy cada campo? (Confirmar que `Vpv1`,
  `Iac1`, etc. ya vienen en las mismas unidades que espera la tabla —
  Volts/Amps/Hz/kW tal cual el DTU las expone, sin conversión rara.)
- ¿Cada cuánto corre hoy? (El bot viejo bajaba un Excel mensual una vez por
  ciclo de 300s vía `ciclo_automatizado.bat`; si el script nuevo tiene otra
  cadencia, no hay problema — el endpoint acepta cualquier frecuencia.)
- ¿Ya persiste algo localmente (CSV/DB) antes de este cambio, que convenga
  mantener como respaldo?
- ¿Corre como proceso siempre vivo (loop propio) o se dispara externamente
  (cron/Task Scheduler)? Define si necesita agregar su propio scheduler o no.

Una vez resueltas estas preguntas (lo ideal es pasar el código real del
script), el cambio en sí es chico: agregar la función de POST HTTP con la
API key, y listo.
