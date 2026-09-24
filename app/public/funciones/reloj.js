// Reloj digital en hora Argentina (fuerza la zona horaria explícitamente,
// no depende de la zona horaria del navegador de quien mire la página).

let relojInterval;

function actualizarRelojArgentina() {
    const ahora = new Date();
    const opcionesHora = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Cordoba' // Misma zona que Corrientes
    };

    const [hora, minuto, segundo] = ahora.toLocaleTimeString('es-AR', opcionesHora).split(':');

    const horaElement = document.getElementById('hora');
    const minutoElement = document.getElementById('minuto');
    const segundoElement = document.getElementById('segundo');
    const localizacionElement = document.getElementById('localizacion');

    if (horaElement) horaElement.textContent = hora;
    if (minutoElement) minutoElement.textContent = minuto;
    if (segundoElement) segundoElement.textContent = segundo;
    if (localizacionElement) localizacionElement.textContent = 'GMT-3 / UTC-3';
}

export function initReloj() {
    actualizarRelojArgentina();
    clearInterval(relojInterval);
    relojInterval = setInterval(actualizarRelojArgentina, 1000);
}
