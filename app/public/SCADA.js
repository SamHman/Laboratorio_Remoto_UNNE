import { initLogout, initWhoami } from './funciones/session.js';
import { initReloj } from './funciones/reloj.js';
import { initDashboard } from './funciones/dashboard.js';
import { initRelayControl } from './funciones/relay.js';

// Constantes de configuración: funciones/config.js
// Notificaciones (showNotification): funciones/notificaciones.js

// Usuario autenticado
let userData = {
    username: 'Usuario'
};


initLogout();
initWhoami();
initReloj();

//////// Logica de dashboard ///////
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    initRelayControl();
});
