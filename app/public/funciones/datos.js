// Datos del dashboard: inversor + irradiancia/temperatura desde los PHP

import { API_PHP_BASE, CACHE_SIZE, STALE_DATA_MS } from './config.js';

function toTimestamp(fechaHora) {
    return new Date(fechaHora.replace(' ', 'T')).getTime();
}

// A cada registro del inversor le asigna la lectura del sensor más reciente que no sea
// posterior a su fecha. Ambos arrays vienen ordenados de más viejo a más nuevo (los PHP
// hacen array_reverse), y fecha_hora es 'YYYY-MM-DD HH:MM:SS', que se compara bien como texto.
// Si el Sheet de irradiancia dejó de actualizarse, la lectura más reciente encontrada puede
// quedar mucho más vieja que el registro del inversor al que se está asignando: irradiancia_stale
// marca ese caso para que el gráfico la muestre como sin-dato en vez de arrastrarla indefinidamente
// (temperatura/irradiancia/fecha_hora_sensor_raw quedan igual, con el valor real, para el panel de detalle).
function mergeByNearestSensor(inversorArr, sensorArr) {
    let sPtr = 0;
    return inversorArr.map(inv => {
        while (sPtr + 1 < sensorArr.length && sensorArr[sPtr + 1].fecha_hora <= inv.fecha_hora) {
            sPtr++;
        }
        const candidato = sensorArr[sPtr];
        const sensor = candidato && candidato.fecha_hora <= inv.fecha_hora ? candidato : {};
        const irradiancia_stale = !!sensor.fecha_hora
            && (toTimestamp(inv.fecha_hora) - toTimestamp(sensor.fecha_hora)) > STALE_DATA_MS;
        return {
            ...inv,
            temperatura: sensor.temperatura ?? null,
            irradiancia: sensor.irradiancia ?? null,
            fecha_hora_sensor_raw: sensor.fecha_hora ?? null,
            irradiancia_stale
        };
    });
}

// Devuelve los últimos CACHE_SIZE registros del inversor combinados con el sensor.
export async function fetchDatosDashboard() {
    const [resInversor, resIrradiancia] = await Promise.all([
        fetch(`${API_PHP_BASE}/obtener_datos_inversor.php?limit=${CACHE_SIZE}`),
        fetch(`${API_PHP_BASE}/obtener_datos_irradiancia.php?limit=${CACHE_SIZE}`)
    ]);
    if (!resInversor.ok || !resIrradiancia.ok) {
        throw new Error(`HTTP inversor ${resInversor.status}, irradiancia ${resIrradiancia.status}`);
    }

    const [inversor, irradiancia] = await Promise.all([resInversor.json(), resIrradiancia.json()]);
    if (inversor.status !== 'ok' || irradiancia.status !== 'ok') {
        throw new Error(inversor.message || irradiancia.message || 'Respuesta inesperada del servidor');
    }

    return mergeByNearestSensor(inversor.data || [], irradiancia.data || []);
}
