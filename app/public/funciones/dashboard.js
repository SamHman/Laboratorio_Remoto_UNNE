// Dashboard: panel de datos, gráficos, modales y exportación a Excel

import { POLL_INTERVAL, UI_UPDATE_INTERVAL, CLICK_HOLD_TIME } from './config.js';
import { fetchDatosDashboard } from './datos.js';
import { crearPanel, updateDataPanel, formatearFecha } from './panelDatos.js';
import { initGraficos, updateCharts, abrirModalGrafico } from './graficos.js';
import { initModales } from './modales.js';
import { initExportar } from './exportar.js';
import { showNotification } from './notificaciones.js';

let datos = [];
// Lecturas en vivo que GoodWeReader transmite tras una maniobra de relés (llegan
// por WS vía relay.js). No están en la base: se muestran solo hasta que llega el
// promedio del minuto que las incluye.
let instantaneos = [];
let lastUIUpdateTime = 0;
let mostrandoPuntoClickeado = false;
let clickTimeout = null;

function mostrarUltimoDato() {
    const ultimo = instantaneos.length > 0 ? instantaneos[instantaneos.length - 1] : datos[datos.length - 1];
    if (ultimo) updateDataPanel(ultimo);
}

// El promedio se guarda con la hora de inicio de su minuto (HH:MM:00): cuando
// aparece, los instantáneos de ese minuto o anteriores ya están incluidos en él.
function retirarInstantaneosCubiertos() {
    const ultimoPromedio = datos[datos.length - 1];
    if (!ultimoPromedio) return;
    const minutoCubierto = ultimoPromedio.fecha_hora.slice(0, 16);
    instantaneos = instantaneos.filter(r => r.fecha_hora.slice(0, 16) > minutoCubierto);
}

function onInstantaneo(event) {
    const lectura = event.detail;
    // El sensor no se transmite en vivo: se acompaña con la última lectura conocida
    const sensor = datos[datos.length - 1] || {};
    instantaneos.push({
        ...lectura,
        fecha_hora_formatted: lectura.fecha_hora.split(' ')[1],
        temperatura: sensor.temperatura ?? null,
        irradiancia: sensor.irradiancia ?? null,
        fecha_hora_sensor_raw: sensor.fecha_hora_sensor_raw ?? null,
        instantaneo: true
    });
    // Sin pasar por UI_UPDATE_INTERVAL: el usuario tiene que ver el efecto de su orden ya.
    // Panel antes que gráfico: si Chart.js no cargó, updateCharts falla pero el panel se ve igual.
    if (!mostrandoPuntoClickeado) mostrarUltimoDato();
    updateCharts(datos, instantaneos);
}

function updateUIFromCache() {
    if (mostrandoPuntoClickeado) return;
    const now = Date.now();
    if (now - lastUIUpdateTime < UI_UPDATE_INTERVAL) return;
    lastUIUpdateTime = now;
    mostrarUltimoDato();
}

// Click en un punto del gráfico: el panel muestra ese registro durante CLICK_HOLD_TIME
function onPointClick(registro) {
    updateDataPanel(registro);
    mostrandoPuntoClickeado = true;
    clearTimeout(clickTimeout);

    const fechaSensor = registro.fecha_hora_sensor_raw ? formatearFecha(registro.fecha_hora_sensor_raw) : 'N/A';
    showNotification(`📊 Inversor: ${formatearFecha(registro.fecha_hora)} | 🌡️ Sensor: ${fechaSensor}`, 'info');

    clickTimeout = setTimeout(() => {
        mostrandoPuntoClickeado = false;
        mostrarUltimoDato();
        showNotification('Volviendo a la visualización automática', 'info');
    }, CLICK_HOLD_TIME);
}

async function cargarDatos() {
    try {
        const nuevos = await fetchDatosDashboard();
        if (nuevos.length === 0) {
            console.warn('[dashboard] No hay datos del inversor disponibles');
            return;
        }
        // Reemplaza en vez de acumular: el PHP ya devuelve los últimos CACHE_SIZE registros
        datos = nuevos;
        retirarInstantaneosCubiertos();
        updateCharts(datos, instantaneos);
        updateUIFromCache();
    } catch (error) {
        console.error('[dashboard] Error al obtener datos:', error);
    }
}

export function initDashboard() {
    crearPanel(document.getElementById('data-panel'));
    // Modales y exportación antes que los gráficos: si el CDN de Chart.js no carga,
    // initGraficos falla pero exportar a Excel sigue funcionando.
    initModales();
    initExportar();
    initGraficos(onPointClick);
    document.querySelector('.expand-btn').addEventListener('click', abrirModalGrafico);
    window.addEventListener('inversor-instantaneo', onInstantaneo);

    cargarDatos();
    setInterval(cargarDatos, POLL_INTERVAL);
}
