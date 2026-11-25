import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jsonwebtoken from 'jsonwebtoken';
import db from '../db.js';

// Sincroniza datos_irradiancia contra un Google Sheet ("DataLogger ESP32 - UNNE",
// compartido de forma privada con una cuenta de servicio de solo lectura). No usa
// la librería googleapis (evita esa dependencia pesada): arma el JWT del service
// account a mano con jsonwebtoken (ya es dependencia del proyecto) y llama
// directo a la API REST de Sheets v4 con fetch (nativo desde Node 18+).
//
// Lectura incremental (2026-11-20, detalle en GoogleSheets20_11.md):
// - El PRIMER ciclo después de arrancar node descarga y hace upsert de todo el Sheet
//   (completa cualquier hueco: base nueva, node caído un tiempo, datos viejos
//   corregidos a mano en el Sheet -> reiniciar el contenedor).
// - Los ciclos siguientes NO descargan la hoja entera: piden solo desde la última fila
//   conocida menos un margen (rango A{fila}:F, por número de fila; la API de valores
//   no sabe filtrar por fecha, pero sí por fila). Así la descarga es siempre de unas
//   pocas miles de filas, sin importar cuánto crezca la hoja.
// - De lo descargado, solo se hace upsert de las filas de los últimos
//   IRRADIANCIA_SYNC_DIAS días (hora Argentina).
// - Vuelve a leer completo si cambió la primera pestaña (se creó/reordenó una) o si la
//   hoja se achicó (filas borradas o archivadas: los números de fila ya no sirven).
// - IRRADIANCIA_SYNC_DIAS=0 vuelve al comportamiento original: todo el Sheet en cada ciclo.

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedToken = null; // { accessToken, expiresAt }
let lastSheetTitle = null; // solo para loguear cuando cambia la pestaña leída

function loadServiceAccountKey() {
    const configuredPath = process.env.GOOGLE_SHEETS_KEY_FILE;
    if (!configuredPath) return null;
    const keyPath = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(PROJECT_ROOT, configuredPath);
    if (!fs.existsSync(keyPath)) {
        console.error(`[irradianciaSync] No se encontró el archivo de credenciales: ${keyPath}`);
        return null;
    }
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
}

async function getAccessToken(serviceAccountKey) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expiresAt > now + 60) {
        return cachedToken.accessToken;
    }

    const claims = {
        iss: serviceAccountKey.client_email,
        scope: SHEETS_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
    };
    const assertion = jsonwebtoken.sign(claims, serviceAccountKey.private_key, { algorithm: 'RS256' });

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Error obteniendo access token de Google: ${JSON.stringify(data)}`);
    }

    cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in };
    return cachedToken.accessToken;
}

async function sheetsApiGet(accessToken, url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Error de Sheets API (${url}): ${JSON.stringify(data)}`);
    }
    return data;
}

// Se lee siempre la PRIMERA pestaña por posición (aunque esté oculta), sin importar
// su nombre: es el mismo criterio que usa el Apps Script que recibe los datos del
// ESP32 (`getSheets()[0]`). Se resuelve en cada ciclo, sin cachear el nombre, para
// que reordenar/renombrar/borrar pestañas en el Sheet se refleje en el ciclo
// siguiente sin reiniciar el contenedor (antes el nombre quedaba fijo hasta reiniciar).
async function resolveSheetTitle(accessToken, spreadsheetId) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title,index)`;
    const data = await sheetsApiGet(accessToken, url);
    const sheets = (data.sheets || [])
        .map((s) => s.properties)
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (sheets.length === 0) {
        throw new Error(`El spreadsheet ${spreadsheetId} no tiene hojas`);
    }
    const title = sheets[0].title;
    if (title !== lastSheetTitle) {
        console.log(`[irradianciaSync] Leyendo la primera pestaña del Sheet: "${title}"`);
        lastSheetTitle = title;
    }
    return title;
}

// Columnas del Sheet que se leen (índice base 0 dentro de cada fila): A = fecha/hora,
// C = irradiancia, F = temperatura. Las columnas B, D y E se leen pero no se usan.
const COL_FECHA = 0;
const COL_IRRADIANCIA = 2;
const COL_TEMPERATURA = 5;

// filaInicio: número de fila del Sheet (base 1) desde la que se lee hasta el final.
// La API devuelve las filas vacías intermedias como [] y corta solo las del final,
// así que la fila de la posición i del resultado es siempre filaInicio + i.
async function fetchSheetRows(accessToken, spreadsheetId, sheetTitle, filaInicio = 1) {
    // Sin fila de encabezado: la fila 1 ya es el primer dato registrado.
    // El rango llega hasta F para incluir la columna de temperatura.
    // Nombre entre comillas simples (y comillas internas duplicadas): notación A1
    // necesaria si la pestaña tiene espacios o caracteres especiales, ej. 'Hoja 2'
    const range = `'${sheetTitle.replace(/'/g, "''")}'!A${filaInicio}:F`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const data = await sheetsApiGet(accessToken, url);
    return data.values || [];
}

// El Sheet mezcla dos formatos de fecha en la columna A según cuándo se cargó la fila
// (se verificó contra datos reales): filas viejas como "2026-08-14 11:06:08" (ya en
// formato MySQL) y filas más nuevas como "10/09/2026 12:26:48" (DD/MM/YYYY, locale
// es-AR). Se distinguen sin ambigüedad por el separador ("-" vs "/").
function parseFechaHora(raw) {
    const value = String(raw).trim();

    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (iso) {
        const [, y, mo, d, h, mi, s] = iso;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${mi}:${s}`;
    }

    const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (dmy) {
        const [, d, mo, y, h, mi, s] = dmy;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${mi}:${s}`;
    }

    return null;
}

// "255,99" (coma decimal, locale del Sheet) -> 255.99
function parseDecimalComa(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = parseFloat(String(raw).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

// El DTU a veces sigue mandando lecturas fantasma de noche (sin sol, sin sentido
// guardarlas). Regla fija: solo se guarda lo que cae en [HORA_INICIO_VALIDA,
// HORA_FIN_VALIDA) - 06:00 inclusive, 19:00 excluido (misma ventana que el Apps Script). No es un filtro de consulta,
// es un filtro de INGESTA: la fila descartada nunca llega a hacer INSERT, así que
// un export de 19:00 a 5:00 da vacío sin tener que tocar el Sheet.
const HORA_INICIO_VALIDA = '06:00:00';
const HORA_FIN_VALIDA = '19:00:00';

function horaFueraDeVentana(fecha_hora) {
    const hora = fecha_hora.slice(11); // "YYYY-MM-DD HH:MM:SS" -> "HH:MM:SS"
    return hora < HORA_INICIO_VALIDA || hora >= HORA_FIN_VALIDA;
}

// Factor de calibración del piranómetro: multiplica el valor crudo de irradiancia (col C) antes de guardarlo.
const K_IRRADIANCIA = 20.4112;

// Lecturas crudas de irradiancia (col C, en mV, ANTES de multiplicar por K) que NO se
// guardan (2026-11-25) - la fila entera se descarta, así no ensucia dashboard ni Excel:
// - >= 255.99: escala completa del ADS1115 (255.992 mV). Es lo que lee el canal con la
//   entrada al aire (piranómetro desconectado); daría ~5.225 W/m², físicamente imposible.
// - < 0: no tiene sentido físico. Incluye -256, que el datalogger usa cuando el canal no
//   respondió por I2C. (Antes los negativos se guardaban como 0; ahora se descartan.)
// La temperatura no se filtra: 0 °C y negativos son valores reales posibles.
const IRRADIANCIA_SATURADA_MV = 255.99;

const UPSERT_CHUNK_SIZE = 500;

// Fecha de corte "YYYY-MM-DD 00:00:00" en hora Argentina (UTC-3, sin horario de
// verano), N días atrás contando hoy: N=2 -> desde ayer 00:00. Mismo formato que
// devuelve parseFechaHora, así que se compara como string.
const formateadorFechaAR = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
});

function fechaCorte(dias) {
    const desde = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000);
    return `${formateadorFechaAR.format(desde)} 00:00:00`;
}

let primerCicloHecho = false;
// Última lectura exitosa: { pestana, ultimaFila } (ultimaFila = número de fila del
// Sheet de la última fila con datos). null hasta el primer ciclo completo.
let ultimaLectura = null;

// Filas que se vuelven a pedir hacia atrás desde la última conocida: 1440 por día
// (1 por minuto las 24 h, peor caso aunque hoy el datalogger solo escriba 06-19 h).
// Cubre la ventana de IRRADIANCIA_SYNC_DIAS y absorbe filas insertadas a mano en el medio.
function margenFilas(diasVentana) {
    return Math.max(1, diasVentana) * 1440;
}

async function upsertRows(rows) {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, NOW())').join(', ');
        const values = chunk.flat();
        await db.query(
            `INSERT INTO datos_irradiancia (fecha_hora, irradiancia, temperatura, fecha_importacion)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE irradiancia = VALUES(irradiancia), temperatura = VALUES(temperatura), fecha_importacion = NOW()`,
            values
        );
    }
}

async function syncOnce(serviceAccountKey, spreadsheetId, diasVentana) {
    const accessToken = await getAccessToken(serviceAccountKey);
    const sheetTitle = await resolveSheetTitle(accessToken, spreadsheetId);

    const pestanaCambio = ultimaLectura !== null && ultimaLectura.pestana !== sheetTitle;
    if (pestanaCambio) {
        console.log(`[irradianciaSync] Cambió la primera pestaña ("${ultimaLectura.pestana}" -> "${sheetTitle}"): lectura completa`);
    }
    let completo = !primerCicloHecho || diasVentana <= 0 || ultimaLectura === null || pestanaCambio;
    let filaInicio = completo ? 1 : Math.max(1, ultimaLectura.ultimaFila - margenFilas(diasVentana) + 1);
    let rows = await fetchSheetRows(accessToken, spreadsheetId, sheetTitle, filaInicio);

    // Si lo leído no llega hasta la última fila que ya conocíamos, la hoja se achicó
    // (se borraron o archivaron filas) y los números de fila se corrieron: releer completo.
    if (filaInicio > 1 && filaInicio + rows.length - 1 < ultimaLectura.ultimaFila) {
        console.log(`[irradianciaSync] La hoja tiene menos filas que antes (última conocida: ${ultimaLectura.ultimaFila}): lectura completa`);
        completo = true;
        filaInicio = 1;
        rows = await fetchSheetRows(accessToken, spreadsheetId, sheetTitle, 1);
    }

    const ultimaFila = filaInicio + rows.length - 1;
    if (rows.length === 0) {
        ultimaLectura = { pestana: sheetTitle, ultimaFila: 0 };
        primerCicloHecho = true;
        return;
    }

    // De lo descargado, solo se hace upsert desde "hoy menos N días". El corte es por
    // fecha y NO por MAX(fecha_hora) de la tabla: esa comparación se probó frágil
    // apenas la tabla tiene filas con fechas que no vienen del propio Sheet (ej. datos
    // dummy con timestamps más "nuevos" que el historial real), porque bloqueaba
    // silenciosamente la sincronización entera. El upsert por fecha_hora es
    // idempotente, así que solapar días es seguro.
    const corte = completo ? null : fechaCorte(diasVentana);

    const toUpsert = [];
    let descartadasPorHorario = 0;
    let descartadasSaturadas = 0;
    let descartadasNegativas = 0;
    for (const row of rows) {
        // La API de Sheets omite las celdas vacías del final de la fila: una columna
        // ausente llega como undefined y parseDecimalComa la convierte en null
        const rawFecha = row[COL_FECHA];
        const rawIrr = row[COL_IRRADIANCIA];
        const rawTemp = row[COL_TEMPERATURA];
        const fecha_hora = parseFechaHora(rawFecha || '');
        if (!fecha_hora) continue;
        if (corte && fecha_hora < corte) continue;
        if (horaFueraDeVentana(fecha_hora)) {
            descartadasPorHorario++;
            continue;
        }
        let irr = parseDecimalComa(rawIrr);
        if (irr !== null) {
            if (irr >= IRRADIANCIA_SATURADA_MV) {
                descartadasSaturadas++;
                continue;
            }
            if (irr < 0) {
                descartadasNegativas++;
                continue;
            }
            irr = Math.round(irr * K_IRRADIANCIA * 10000) / 10000;
        }
        toUpsert.push([fecha_hora, irr, parseDecimalComa(rawTemp)]);
    }

    if (toUpsert.length > 0) {
        await upsertRows(toUpsert);
        // Última fila sincronizada: permite comprobar en el log qué columnas se están leyendo
        const [uFecha, uIrr, uTemp] = toUpsert[toUpsert.length - 1];
        const alcance = completo
            ? `Sheet completo, ${rows.length} filas leídas`
            : `filas ${filaInicio}-${ultimaFila} leídas, upsert desde ${corte}`;
        console.log(`[irradianciaSync] ${toUpsert.length} fila(s) sincronizada(s) (${alcance}). Última: ${uFecha} | irradiancia (col C) = ${uIrr} | temperatura (col F) = ${uTemp}`);
    }
    if (descartadasPorHorario > 0) {
        console.log(`[irradianciaSync] ${descartadasPorHorario} fila(s) descartada(s) por estar fuera del horario ${HORA_INICIO_VALIDA}-${HORA_FIN_VALIDA}`);
    }
    if (descartadasSaturadas > 0 || descartadasNegativas > 0) {
        console.log(`[irradianciaSync] Descartadas por irradiancia inválida: ${descartadasSaturadas} saturada(s) (>= ${IRRADIANCIA_SATURADA_MV} mV, piranómetro desconectado), ${descartadasNegativas} negativa(s)`);
    }
    // Recién después de un ciclo exitoso: si el primero falla (Google caído,
    // credencial mal), el próximo vuelve a intentar el Sheet completo, y si falla
    // un upsert incremental, el siguiente vuelve a pedir desde la misma fila.
    ultimaLectura = { pestana: sheetTitle, ultimaFila };
    primerCicloHecho = true;
}

export function startIrradianciaSync() {
    const spreadsheetId = process.env.GOOGLE_SHEETS_IRRADIANCIA_ID;
    const intervalMs = Number(process.env.IRRADIANCIA_POLL_INTERVAL_MS) || 60000;
    // Sin definir o inválida -> 2 días. 0 (o negativo) -> Sheet completo en cada ciclo.
    const diasRaw = (process.env.IRRADIANCIA_SYNC_DIAS ?? '').trim();
    const diasVentana = diasRaw !== '' && Number.isFinite(Number(diasRaw)) ? Math.floor(Number(diasRaw)) : 2;
    const serviceAccountKey = loadServiceAccountKey();

    if (!serviceAccountKey || !spreadsheetId) {
        console.log('[irradianciaSync] Sin configurar (falta GOOGLE_SHEETS_KEY_FILE o GOOGLE_SHEETS_IRRADIANCIA_ID) — no se inicia la sincronización.');
        return;
    }

    // Un ciclo a la vez: setInterval no espera a que termine el anterior. Si uno tarda
    // más que el intervalo (Google lento, lectura completa de una hoja grande), el tick
    // siguiente se saltea en vez de encimarse y acumular descargas en memoria.
    let enCurso = false;
    const tick = () => {
        if (enCurso) {
            console.log('[irradianciaSync] El ciclo anterior sigue en curso, se saltea este tick');
            return;
        }
        enCurso = true;
        syncOnce(serviceAccountKey, spreadsheetId, diasVentana)
            .catch((err) => {
                console.error('[irradianciaSync] Error en la sincronización:', err.message);
            })
            .finally(() => { enCurso = false; });
    };

    console.log(diasVentana > 0
        ? `[irradianciaSync] Iniciando sincronización cada ${intervalMs}ms (primer ciclo: Sheet completo; después: últimas ${margenFilas(diasVentana)} filas, upsert de los últimos ${diasVentana} día(s))`
        : `[irradianciaSync] Iniciando sincronización cada ${intervalMs}ms (Sheet completo en cada ciclo)`);
    tick();
    setInterval(tick, intervalMs);
}
