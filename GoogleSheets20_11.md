# Sincronización del Google Sheet de irradiancia — cambios del 2026-11-20

Archivo modificado: `app/services/irradianciaSync.js` (más `IRRADIANCIA_SYNC_DIAS`
en `docker-compose.yml` y `.env_EJEMPLO`). Fecha de modificación: **2026-11-20**.

## Contexto del problema

La irradiancia y la temperatura no llegan directo al servidor: un datalogger
(ESP32 + piranómetro) las escribe, mediante un Apps Script, en el Google Sheet
"DataLogger ESP32 - UNNE", una fila por minuto entre las 06:00 y las 19:00
(~780 filas por día). El servicio `irradianciaSync.js`, que corre dentro del
contenedor `node`, lee ese Sheet cada minuto con una cuenta de servicio de solo
lectura y copia las filas a la tabla `datos_irradiancia` de MySQL.

Hasta el 2026-11-20 lo hacía de la forma más simple posible: **cada minuto
descargaba la hoja completa y hacía upsert de todas sus filas**. Con el Sheet
recién empezado eso no se notaba, pero escala mal, por tres motivos:

1. **Reescritura de toda la tabla cada minuto.** El upsert incluye
   `fecha_importacion = NOW()`, que cambia siempre; entonces MySQL no veía filas
   "iguales" sino filas modificadas, y reescribía de verdad todas las filas cada
   minuto. MySQL 8 guarda cada modificación en el *binlog* durante 30 días: con
   un mes de datos en el Sheet eran ~2,7 GB de binlog por día (~80 GB retenidos);
   con un año, ~33 GB por día. Ninguna VPS lo aguanta.
2. **Descarga creciente.** Con ~13.000 filas eran ~1 MB por minuto (~1,4 GB por
   día de tráfico); con un año de datos serían ~20 MB por minuto, más la RAM de
   Node para procesarlos.
3. **Ciclos encimados.** `setInterval` no espera a que termine el ciclo anterior.
   Con una hoja grande, una lectura podía tardar más de un minuto y los ciclos se
   iban acumulando en memoria.

## Qué se cambió

Se hizo en dos pasos el mismo día.

**Paso 1 — ventana de upsert por fecha.** De lo leído, solo se hace upsert de
las filas desde `IRRADIANCIA_SYNC_DIAS` días atrás (hora Argentina; default 2 =
desde ayer 00:00). Esto resolvió el problema 1. El corte es por "hoy menos N
días" y **no** por `MAX(fecha_hora)` de la tabla, porque esa comparación ya se
había probado frágil: filas dummy con fechas más "nuevas" que el historial real
bloqueaban la sincronización entera sin avisar.

**Paso 2 — lectura incremental por número de fila.** La API de Google no sabe
filtrar por fecha, pero sí por rango de filas. Ahora:

1. **Primer ciclo al arrancar `node`:** descarga la hoja completa (`A1:F`) y hace
   upsert de todo. Recupera cualquier hueco (base nueva, `node` caído un tiempo,
   datos viejos corregidos a mano en el Sheet). Node anota el número de la última
   fila con datos.
2. **Ciclos siguientes:** pide solo desde la última fila conocida menos un margen
   (`A{fila}:F`). Margen = `IRRADIANCIA_SYNC_DIAS × 1440` filas (2.880 con el
   default: 1 por minuto las 24 h, el peor caso). La descarga queda **fija en unas
   pocas miles de filas**, sin importar cuánto crezca la hoja. Esto resolvió el
   problema 2.
3. Después de cada ciclo exitoso actualiza el número de la última fila. Si un
   ciclo falla, el siguiente vuelve a pedir desde el mismo punto.
4. **Vuelve a leer la hoja completa** automáticamente cuando:
   - cambia el nombre de la primera pestaña (se creó una pestaña nueva y se la
     puso primera, o se reordenaron);
   - la hoja tiene menos filas que antes (se borraron o archivaron filas: los
     números de fila se corrieron).
5. **Un ciclo a la vez:** si el anterior sigue en curso, el tick se saltea en vez
   de encimarse. Esto resolvió el problema 3.

`IRRADIANCIA_SYNC_DIAS=0` vuelve al comportamiento original (hoja completa, upsert
de todo, en cada ciclo).

## Qué NO cambia

- El **Apps Script del datalogger no se toca.** Sigue escribiendo en la primera
  pestaña (`getSheets()[0]`), que es la misma que lee el sync.
- El formato de las filas, las columnas leídas (A fecha, C irradiancia, F
  temperatura), el factor `K_IRRADIANCIA` y el filtro horario 06:00–19:00.
- La tabla `datos_irradiancia` y todo lo que la lee (dashboard, Excel).

## Cómo operarlo

| Situación | Qué hacer |
|---|---|
| Datos viejos que faltan en la base, o corregidos a mano en el Sheet | `docker restart labvirtualunne_node` (el primer ciclo lee todo) |
| La hoja se está poniendo grande | Crear una pestaña nueva y **ponerla primera**. El Apps Script y el sync pasan a usarla solos; los datos viejos ya están en la base. |
| Ventana de días más amplia | `IRRADIANCIA_SYNC_DIAS=7` en el `.env` + `docker compose up -d` |

Para confirmar que anda, mirar `docker logs labvirtualunne_node`: el primer
ciclo dice `Sheet completo, N filas leídas` y los siguientes
`filas X-Y leídas, upsert desde AAAA-MM-DD 00:00:00`.

## Límites que quedan

- **Límite de Google: 10 millones de celdas por Sheet, contando las columnas
  vacías de la grilla.** Con 7 columnas son ~1,43 millones de filas (~5 años a
  780 filas por día); con las 26 columnas por defecto, ~385.000 filas (~16
  meses). Borrar las columnas vacías o rotar de pestaña lo evita. El servidor ya
  no es el límite: lee siempre unas 2.880 filas por minuto.
- La única lectura grande es la del arranque. Con una hoja al tope de Google
  (~1,4 M filas) serían ~100 MB de descarga y ~0,5–0,7 GB de RAM de Node por
  unos minutos, una sola vez (estimación, no medida).
- Sigue el `fecha_importacion = NOW()` en el upsert: las ~1.560 filas de la
  ventana se reescriben cada minuto (~170 MB/día de binlog, retenido 30 días).
  Sacarlo del `UPDATE` lo llevaría a casi cero; no se hizo todavía.

## Cómo se probó

Simulación local con el Sheet y la base reemplazados por versiones falsas (sin
tocar Google ni MySQL), 7.800 filas de 10 días:

| Paso | Rango pedido | Filas descargadas |
|---|---|---|
| Arranque | `A1:F` | 7.800 (completo) |
| Ciclo siguiente | `A4921:F` | 2.880 |
| Tras agregar filas | `A4921:F` | 2.885 |
| Tras borrar 3.000 filas viejas | detecta que se achicó, relee `A1:F` | 4.805 |
| Ciclo siguiente | `A1926:F` | 2.880 |
| Pestaña nueva puesta primera | detecta el cambio, relee `A1:F` | 100 |

**Falta probarlo contra el Sheet real**, en local o en el próximo deploy,
revisando los logs como se indica arriba.
