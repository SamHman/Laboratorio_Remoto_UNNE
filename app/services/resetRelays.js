// Reset diario de relés: a la hora indicada (hora de Argentina) deja los 3 relés en
// ON, para que ningún usuario deje uno apagado hasta la próxima experiencia.
//
// La hora se calcula con Intl en America/Argentina/Buenos_Aires (UTC-3, sin horario
// de verano), no con la zona del contenedor: la VPS corre en UTC.
//
// Si a la hora del reset el bridge-agent/ESP32 no están conectados, se reintenta
// cada tick hasta VENTANA_REINTENTO_MIN minutos después; pasada la ventana se
// abandona ese día (no tiene sentido resetear de madrugada una experiencia nueva).

import { resetAllRelaysOn } from "../controllers/relay.controller.js";

const HORA_RESET = 18;
const MINUTO_RESET = 40;
const VENTANA_REINTENTO_MIN = 10;
const TICK_MS = 15 * 1000;

const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

function ahoraArgentina() {
    const p = Object.fromEntries(formateador.formatToParts(new Date()).map(x => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, minutosDelDia: Number(p.hour) * 60 + Number(p.minute) };
}

export function startResetRelays() {
    let ultimoDiaHecho = null;
    let enCurso = false;

    setInterval(async () => {
        if (enCurso) return;
        const { fecha, minutosDelDia } = ahoraArgentina();
        const inicio = HORA_RESET * 60 + MINUTO_RESET;
        if (ultimoDiaHecho === fecha) return;
        if (minutosDelDia < inicio || minutosDelDia >= inicio + VENTANA_REINTENTO_MIN) return;

        enCurso = true;
        try {
            const r = await resetAllRelaysOn();
            if (r.ok) {
                ultimoDiaHecho = fecha;
                console.log(r.enviados.length
                    ? `[resetRelays] Reset ${HORA_RESET}:${MINUTO_RESET}: encendidos los relés ${r.enviados.join(", ")}`
                    : `[resetRelays] Reset ${HORA_RESET}:${MINUTO_RESET}: los 3 relés ya estaban en ON`);
            } else {
                console.warn(`[resetRelays] No se pudo resetear (${r.motivo}), se reintenta`);
            }
        } catch (error) {
            console.error("[resetRelays] Error inesperado:", error);
        } finally {
            enCurso = false;
        }
    }, TICK_MS);

    console.log(`[resetRelays] Programado: reset de relés a ON todos los días a las ${HORA_RESET}:${MINUTO_RESET} (hora Argentina)`);
}
