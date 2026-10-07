// Apertura y cierre de modales (.modal.is-open en SCADA.css)

export function abrirModal(modal) {
    modal.classList.add('is-open');
}

export function cerrarModal(modal) {
    modal.classList.remove('is-open');
}

export function initModales() {
    document.querySelectorAll('.modal .close-button').forEach(boton => {
        boton.addEventListener('click', () => cerrarModal(boton.closest('.modal')));
    });

    // Click en el fondo oscuro (fuera del contenido) cierra el modal
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) cerrarModal(e.target);
    });
}
