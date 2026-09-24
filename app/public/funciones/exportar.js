// Exportación del dashboard a Excel (exportar_datos_dashboard.php)

import { API_PHP_BASE } from './config.js';
import { showNotification, mostrarProgreso } from './notificaciones.js';
import { abrirModal, cerrarModal } from './modales.js';

const MAX_DIAS = 7;
const TIEMPO_ESTIMADO = 60; // segundos que muestra la cuenta regresiva

// 'YYYY-MM-DDTHH:MM' (input datetime-local) -> 'DD-MM-YYYY HH-MM' para el nombre del archivo
function formatearParaArchivo(valor) {
    const [fecha, hora] = valor.split('T');
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}-${mes}-${anio} ${hora.slice(0, 5).replace(':', '-')}`;
}

function descargarArchivo(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 100);
}

async function exportar(exportModal) {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    if (!startTime || !endTime) {
        showNotification('Por favor seleccione un rango de fechas válido', 'error');
        return;
    }

    const diffDias = (new Date(endTime) - new Date(startTime)) / (1000 * 60 * 60 * 24);
    if (diffDias > MAX_DIAS) {
        showNotification('El rango de fechas no puede ser mayor a 1 semana (7 días)', 'error');
        return;
    }
    if (diffDias < 0) {
        showNotification('La fecha inicial no puede ser mayor que la fecha final', 'error');
        return;
    }

    // Formato DATETIME de MySQL: el PHP compara contra esto, no cambiarlo sin cambiar el PHP
    const start = startTime.replace('T', ' ');
    const end = endTime.replace('T', ' ');

    const cerrarProgreso = mostrarProgreso('Exportando datos a Excel...', TIEMPO_ESTIMADO);
    try {
        const response = await fetch(`${API_PHP_BASE}/exportar_datos_dashboard.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, end })
        }).finally(cerrarProgreso);

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('spreadsheetml.sheet')) {
            const nombre = `Mediciones_${formatearParaArchivo(startTime)}_${formatearParaArchivo(endTime)}.xlsx`;
            descargarArchivo(await response.blob(), nombre);
            showNotification('Datos exportados exitosamente', 'success');
        } else if (response.ok) {
            // 200 sin Excel: el PHP no encontró datos en el rango
            showNotification('No se disponen de datos para el rango de fechas seleccionado.', 'warning');
        } else {
            // 500: falla real del servidor (p. ej. sin conexión a la base), no falta de datos
            const detalle = await response.text();
            console.error(`[EXPORT] El servidor respondió ${response.status}:`, detalle.slice(0, 300));
            showNotification(`Error del servidor al exportar (código ${response.status}).`, 'error');
        }
    } catch (error) {
        console.error('[EXPORT] Error al exportar:', error);
        showNotification('Error al exportar: ' + error.message, 'error');
    }

    cerrarModal(exportModal);
}

export function initExportar() {
    const exportModal = document.getElementById('export-modal');
    const confirmButton = document.getElementById('confirm-export-btn');
    document.getElementById('export-icon').addEventListener('click', () => abrirModal(exportModal));

    // Deshabilitado mientras dura una exportación, para no lanzar dos a la vez
    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        try {
            await exportar(exportModal);
        } finally {
            confirmButton.disabled = false;
        }
    });
}
