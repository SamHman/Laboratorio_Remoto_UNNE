// Constantes de configuración del dashboard

export const CACHE_SIZE = 720;               // 1 hora de datos a 10 segundos por punto
export const UI_UPDATE_INTERVAL = 10 * 1000; // mínimo entre actualizaciones del panel
export const POLL_INTERVAL = 30 * 1000;      // consulta de datos nuevos al servidor
export const CLICK_HOLD_TIME = 10 * 1000;    // cuánto se muestra un punto clickeado del gráfico

// XAMPP local: la página la sirve Node en :4000 y los PHP los sirve Apache (:80) bajo /LabVirtualUNNE.
// VPS y Docker local: nginx manda todo lo que empieza con /app/api/ al contenedor PHP.
export const API_PHP_BASE = window.location.port === '4000'
    ? `${window.location.protocol}//${window.location.hostname}/LabVirtualUNNE/app/api`
    : '/app/api';
