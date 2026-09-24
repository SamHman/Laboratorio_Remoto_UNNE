import { initLogout, initWhoami } from './funciones/session.js';

// Constantes de configuración globales
const UI_UPDATE_INTERVAL = 10 * 1000;            // 10 segundos (actualización de la interfaz)
const CACHE_SIZE = 720; // 1 hora de datos a 10 segundos por punto


// Estado del caché de datos
let cachedData = [];
let lastServerUpdate = 0;

// Usuario autenticado
let userData = {
    username: 'Usuario'
};


initLogout();
initWhoami();
//////////
// Notificación reutilizable
function showNotification(message, type = 'info') {//estos decorados puedo ponerlos en css en su lugar?
    const notification = document.createElement('div');
    notification.className = `export-notif notif-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        background: ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#f59e0b'};
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-weight: bold;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}