// Notificaciones flotantes (estilos en SCADA.CSS)

export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `export-notif notif-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('notif-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Notificación con spinner y cuenta regresiva. Devuelve una función para cerrarla.
export function mostrarProgreso(mensaje, segundos) {
    const notif = document.createElement('div');
    notif.className = 'progress-notif';
    notif.innerHTML = `
        <div class="progress-notif-body">
            <div class="notif-spinner"></div>
            <div>
                <div class="progress-notif-title"></div>
                <div class="progress-notif-countdown">Tiempo estimado: <span></span>s</div>
            </div>
        </div>
    `;
    notif.querySelector('.progress-notif-title').textContent = mensaje;
    const countdownText = notif.querySelector('.progress-notif-countdown');
    const countdownValue = countdownText.querySelector('span');
    countdownValue.textContent = segundos;
    document.body.appendChild(notif);

    let restante = segundos;
    const interval = setInterval(() => {
        restante--;
        if (restante > 0) {
            countdownValue.textContent = restante;
        } else {
            countdownText.textContent = 'Finalizando...';
            clearInterval(interval);
        }
    }, 1000);

    return function cerrar() {
        clearInterval(interval);
        notif.classList.add('notif-out');
        setTimeout(() => notif.remove(), 300);
    };
}
