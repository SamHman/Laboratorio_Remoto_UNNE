// Datos del dashboard: inversor + irradiancia/temperatura desde los PHP

import { API_PHP_BASE, CACHE_SIZE } from './config.js';

// A cada registro del inversor le asigna la lectura del sensor más reciente que no sea
// posterior a su fecha. Ambos arrays vienen ordenados de más viejo a más nuevo (los PHP
// hacen array_reverse), y fecha_hora es 'YYYY-MM-DD HH:MM:SS', que se compara bien como texto.
function mergeByNearestSensor(inversorArr, sensorArr) {
    let sPtr = 0;
    return inversorArr.map(inv => {
        while (sPtr + 1 < sensorArr.length && sensorArr[sPtr + 1].fecha_hora <= inv.fecha_hora) {
            sPtr++;
        }
        const candidato = sensorArr[sPtr];
        const sensor = candidato && candidato.fecha_hora <= inv.fecha_hora ? candidato : {};
        return {
            ...inv,
            temperatura: sensor.temperatura ?? null,
            irradiancia: sensor.irradiancia ?? null,
            fecha_hora_sensor_raw: sensor.fecha_hora ?? null
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
