// Dashboard: panel de datos, gráficos, modales y exportación a Excel

import { POLL_INTERVAL, UI_UPDATE_INTERVAL, CLICK_HOLD_TIME } from './config.js';
import { fetchDatosDashboard } from './datos.js';
import { crearPanel, updateDataPanel, formatearFecha } from './panelDatos.js';
import { initGraficos, updateCharts, abrirModalGrafico } from './graficos.js';
import { initModales } from './modales.js';
import { initExportar } from './exportar.js';
import { showNotification } from './notificaciones.js';

let datos = [];
let lastUIUpdateTime = 0;
let mostrandoPuntoClickeado = false;
let clickTimeout = null;

function mostrarUltimoDato() {
    if (datos.length > 0) updateDataPanel(datos[datos.length - 1]);
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
        updateCharts(datos);
        updateUIFromCache();
    } catch (error) {
        console.error('[dashboard] Error al obtener datos:', error);
    }
}

export function initDashboard() {
    crearPanel(document.getElementById('data-panel'));
    initGraficos(onPointClick);
    initModales();
    document.querySelector('.expand-btn').addEventListener('click', abrirModalGrafico);
    initExportar();

    cargarDatos();
    setInterval(cargarDatos, POLL_INTERVAL);
}
