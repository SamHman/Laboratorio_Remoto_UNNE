// Logout y datos del usuario autenticado (cookie JWT existente, sin check-privileges)

export function initLogout() {
    const logoutIcon = document.getElementById("logout-icon");
    if (logoutIcon) {
        logoutIcon.addEventListener("click", () => {
            document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.location.href = "/";
        });
    }
}

export async function initWhoami() {
    try {
        const response = await fetch('/api/whoami');
        const data = await response.json();
        const usernameEl = document.getElementById('header-username');
        if (usernameEl && data.username) {
            usernameEl.textContent = data.username;
        }
    } catch (e) {
        // si falla, el span queda con el texto inicial ("Cargando...")
    }
}
