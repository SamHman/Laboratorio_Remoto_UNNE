// Marca de la última maniobra de relés aceptada (epoch ms), en memoria.
// GoodWeReader la consulta en cada ciclo de lectura: cuando cambia, transmite
// en vivo durante su INSTANT_WINDOW_SECONDS. Se compara solo por cambio, nunca
// contra el reloj de la otra máquina, así que no importa si los relojes difieren.
// Arranca en null: tras un reinicio de node no hay maniobra que reportar.

let ultimaManiobra = null;

export function registrarManiobra() {
    ultimaManiobra = Date.now();
}

export function getUltimaManiobra() {
    return ultimaManiobra;
}
