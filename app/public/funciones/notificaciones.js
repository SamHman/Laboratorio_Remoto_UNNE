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
// onFinalizar (opcional) se dispara cuando el tiempo de espera termina de verdad -
// ya sea porque el contador llegó a 0 solo, o porque quien la mostró la cerró desde
// afuera (la función que devuelve este mismo mostrarProgreso). El botón de cerrar (×)
// que trae la notificación NO lo dispara: eso es solo ocultar el cartel de la pantalla
// (para que no estorbe, sobre todo en celular), no una señal de que el tiempo terminó.
export function mostrarProgreso(mensaje, segundos, onFinalizar) {
    const notif = document.createElement('div');
    notif.className = 'progress-notif';
    notif.innerHTML = `
        <button type="button" class="progress-notif-close" aria-label="Cerrar">&times;</button>
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
    let oculta = false;

    function ocultar() {
        if (oculta) return;
        oculta = true;
        clearInterval(interval);
        notif.classList.add('notif-out');
        setTimeout(() => notif.remove(), 300);
    }

    const interval = setInterval(() => {
        restante--;
        if (restante > 0) {
            countdownValue.textContent = restante;
        } else {
            countdownText.textContent = 'Finalizando...';
            clearInterval(interval);
            // Se deja un instante el texto "Finalizando..." antes de sacarla sola -
            // antes se quedaba así para siempre porque nada la volvía a tocar.
            setTimeout(() => {
                ocultar();
                if (onFinalizar) onFinalizar();
            }, 1500);
        }
    }, 1000);

    notif.querySelector('.progress-notif-close').addEventListener('click', ocultar);

    return function cerrar() {
        ocultar();
        if (onFinalizar) onFinalizar();
    };
}
