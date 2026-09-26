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
// Diseño sin estado local: en cada ciclo se pregunta a la propia tabla
// (MAX(fecha_hora)) hasta dónde ya se sincronizó, y se descartan las filas del
// Sheet que no sean más nuevas. Sobrevive a reinicios/redeploys sin archivo de
// estado aparte, a costa de releer todo el rango A2:C en cada ciclo — aceptable
// mientras el Sheet no crezca a decenas de miles de filas; si eso pasa, conviene
// paginar por número de fila en vez de por fecha.

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedToken = null; // { accessToken, expiresAt }
let cachedSheetTitle = null;

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

async function resolveSheetTitle(accessToken, spreadsheetId, gid) {
    if (cachedSheetTitle) return cachedSheetTitle;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    const data = await sheetsApiGet(accessToken, url);
    const sheet = (data.sheets || []).find((s) => String(s.properties.sheetId) === String(gid));
    if (!sheet) {
        throw new Error(`No se encontró ninguna hoja con gid=${gid} en el spreadsheet ${spreadsheetId}`);
    }
    cachedSheetTitle = sheet.properties.title;
    return cachedSheetTitle;
}

async function fetchSheetRows(accessToken, spreadsheetId, sheetTitle) {
    // Sin fila de encabezado: la fila 1 ya es el primer dato registrado.
    const range = `${sheetTitle}!A1:C`;
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
// HORA_FIN_VALIDA) - 05:40 inclusive, 19:00 excluido. No es un filtro de consulta,
// es un filtro de INGESTA: la fila descartada nunca llega a hacer INSERT, así que
// un export de 19:00 a 5:00 da vacío sin tener que tocar el Sheet.
const HORA_INICIO_VALIDA = '05:40:00';
const HORA_FIN_VALIDA = '19:00:00';

function horaFueraDeVentana(fecha_hora) {
    const hora = fecha_hora.slice(11); // "YYYY-MM-DD HH:MM:SS" -> "HH:MM:SS"
    return hora < HORA_INICIO_VALIDA || hora >= HORA_FIN_VALIDA;
}

const UPSERT_CHUNK_SIZE = 500;

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

async function syncOnce(serviceAccountKey, spreadsheetId, gid) {
    const accessToken = await getAccessToken(serviceAccountKey);
    const sheetTitle = await resolveSheetTitle(accessToken, spreadsheetId, gid);
    const rows = await fetchSheetRows(accessToken, spreadsheetId, sheetTitle);
    if (rows.length === 0) return;

    // Se resincroniza el rango completo en cada ciclo en vez de filtrar por
    // MAX(fecha_hora): esa comparación se probó frágil apenas la tabla tiene
    // filas con fechas que no vienen del propio Sheet (ej. datos dummy/de
    // prueba con timestamps más "nuevos" que el historial real), porque
    // bloqueaba silenciosamente la sincronización entera. El upsert por
    // fecha_hora ya es idempotente, así que reenviar todo es seguro; el
    // costo (unas pocas centenas de filas por ciclo, por ahora) es aceptable
    // mientras el Sheet no crezca a decenas de miles de filas.
    const toUpsert = [];
    let descartadasPorHorario = 0;
    for (const row of rows) {
        const [rawFecha, rawIrr, rawTemp] = row;
        const fecha_hora = parseFechaHora(rawFecha || '');
        if (!fecha_hora) continue;
        if (horaFueraDeVentana(fecha_hora)) {
            descartadasPorHorario++;
            continue;
        }
        toUpsert.push([fecha_hora, parseDecimalComa(rawIrr), parseDecimalComa(rawTemp)]);
    }

    if (toUpsert.length > 0) {
        await upsertRows(toUpsert);
        console.log(`[irradianciaSync] ${toUpsert.length} fila(s) sincronizada(s) desde el Sheet`);
    }
    if (descartadasPorHorario > 0) {
        console.log(`[irradianciaSync] ${descartadasPorHorario} fila(s) descartada(s) por estar fuera del horario ${HORA_INICIO_VALIDA}-${HORA_FIN_VALIDA}`);
    }
}

export function startIrradianciaSync() {
    const spreadsheetId = process.env.GOOGLE_SHEETS_IRRADIANCIA_ID;
    const gid = process.env.GOOGLE_SHEETS_IRRADIANCIA_GID || '0';
    const intervalMs = Number(process.env.IRRADIANCIA_POLL_INTERVAL_MS) || 60000;
    const serviceAccountKey = loadServiceAccountKey();

    if (!serviceAccountKey || !spreadsheetId) {
        console.log('[irradianciaSync] Sin configurar (falta GOOGLE_SHEETS_KEY_FILE o GOOGLE_SHEETS_IRRADIANCIA_ID) — no se inicia la sincronización.');
        return;
    }

    const tick = () => {
        syncOnce(serviceAccountKey, spreadsheetId, gid).catch((err) => {
            console.error('[irradianciaSync] Error en la sincronización:', err.message);
        });
    };

    console.log(`[irradianciaSync] Iniciando sincronización cada ${intervalMs}ms`);
    tick();
    setInterval(tick, intervalMs);
}
