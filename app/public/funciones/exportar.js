// Exportación del dashboard a Excel:
//   Potencia / Irradiancia -> exportar_datos_tabla.php (una sola tabla, tal cual)
//   Ambos                  -> exportar_datos_dashboard.php (irradiancia emparejada con el inversor)

import { API_PHP_BASE } from './config.js';
import { showNotification, mostrarProgreso } from './notificaciones.js';
import { abrirModal, cerrarModal } from './modales.js';

const MENSAJE_LIMITE_EXCEDIDO = 'Se ha excedido el límite de datos extraíble. Disminuya el rango de fechas.';
const TIEMPO_ESTIMADO = 60; // segundos que muestra la cuenta regresiva

const TIPOS_EXPORTACION = {
    potencia: { endpoint: 'exportar_datos_tabla.php', prefijo: 'Potencia' },
    irradiancia: { endpoint: 'exportar_datos_tabla.php', prefijo: 'Irradiancia' },
    ambos: { endpoint: 'exportar_datos_dashboard.php', prefijo: 'Mediciones' },
};

let tipoSeleccionado = 'ambos';

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
    if (diffDias < 0) {
        showNotification('La fecha inicial no puede ser mayor que la fecha final', 'error');
        return;
    }

    // Formato DATETIME de MySQL: el PHP compara contra esto, no cambiarlo sin cambiar el PHP
    const start = startTime.replace('T', ' ');
    const end = endTime.replace('T', ' ');

    const { endpoint, prefijo } = TIPOS_EXPORTACION[tipoSeleccionado];
    const cerrarProgreso = mostrarProgreso('Exportando datos a Excel...', TIEMPO_ESTIMADO);
    try {
        const response = await fetch(`${API_PHP_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: tipoSeleccionado, start, end })
        }).finally(cerrarProgreso);

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('spreadsheetml.sheet')) {
            const nombre = `${prefijo}_${formatearParaArchivo(startTime)}_${formatearParaArchivo(endTime)}.xlsx`;
            descargarArchivo(await response.blob(), nombre);
            showNotification('Datos exportados exitosamente', 'success');
        } else if (response.ok) {
            // 200 sin Excel: el PHP no encontró datos en el rango
            showNotification('No se disponen de datos para el rango de fechas seleccionado.', 'warning');
        } else {
            // 500/502/504: típicamente el rango es tan grande que se agotó la memoria o el tiempo del servidor
            const detalle = await response.text();
            console.error(`[EXPORT] El servidor respondió ${response.status}:`, detalle.slice(0, 300));
            showNotification(MENSAJE_LIMITE_EXCEDIDO, 'error');
        }
    } catch (error) {
        // Conexión cortada (p. ej. el contenedor PHP se reinició por falta de memoria)
        console.error('[EXPORT] Error al exportar:', error);
        showNotification(MENSAJE_LIMITE_EXCEDIDO, 'error');
    }

    cerrarModal(exportModal);
}

export function initExportar() {
    const exportModal = document.getElementById('export-modal');
    const confirmButton = document.getElementById('confirm-export-btn');
    document.getElementById('export-icon').addEventListener('click', () => abrirModal(exportModal));

    const botonesTipo = exportModal.querySelectorAll('.export-tipo-btn');
    botonesTipo.forEach(boton => {
        boton.addEventListener('click', () => {
            tipoSeleccionado = boton.dataset.tipo;
            botonesTipo.forEach(b => {
                const activo = b === boton;
                b.classList.toggle('active', activo);
                b.setAttribute('aria-pressed', String(activo));
            });
        });
    });

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
