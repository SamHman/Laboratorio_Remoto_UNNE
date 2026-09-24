// Panel lateral con los valores del inversor y del sensor

const PANEL_CONFIG = [
    { key: 'fecha_hora_panel', label: 'Fecha y Hora Inversor', isFecha: true },
    { key: 'Vpv1', label: 'Vpv1 (V)' },
    { key: 'Vpv2', label: 'Vpv2 (V)' },
    { key: 'Ipv1', label: 'Ipv1 (A)' },
    { key: 'Ipv2', label: 'Ipv2 (A)' },
    { key: 'Vac1', label: 'Vac1 (V)' },
    { key: 'Vac2', label: 'Vac2 (V)' },
    { key: 'Vac3', label: 'Vac3 (V)' },
    { key: 'Iac1', label: 'Iac1 (A)' },
    { key: 'Iac2', label: 'Iac2 (A)' },
    { key: 'Iac3', label: 'Iac3 (A)' },
    { key: 'Fac1', label: 'Fac1 (Hz)' },
    { key: 'Fac2', label: 'Fac2 (Hz)' },
    { key: 'Fac3', label: 'Fac3 (Hz)' },
    { key: 'Pac', label: 'Pac (W)' },
    { key: 'EnergyToday', label: 'Energy Today (kWh)' },
    { key: 'EnergyTotal', label: 'Energy Total (kWh)' },
    { key: 'HourTotal', label: 'Horas Totales' },
    { key: 'fecha_hora_sensor', label: 'Fecha y Hora Sensor', isFecha: true, isSensor: true },
    { key: 'temperatura', label: 'Temperatura (°C)', isSensor: true },
    { key: 'irradiancia', label: 'Irradiancia (W/m²)', isSensor: true }
];

const SIN_DATO = '--';
const SIN_FECHA = '--/--/---- --:--:--';

// 'YYYY-MM-DD HH:MM:SS' (formato de MySQL) -> 'DD/MM/YYYY HH:MM:SS', sin pasar por Date
// para no depender de la zona horaria ni del parser del navegador.
export function formatearFecha(fechaHora) {
    if (!fechaHora) return SIN_FECHA;
    const [fecha, hora] = fechaHora.split(' ');
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio} ${hora}`;
}

export function crearPanel(dataPanel) {
    PANEL_CONFIG.forEach(config => {
        const item = document.createElement('div');
        item.classList.add('data-item');

        const label = document.createElement('span');
        label.classList.add('label');
        label.textContent = config.label;

        const value = document.createElement('span');
        value.classList.add('value');
        if (config.isSensor) value.classList.add('sensor');
        value.id = `experimento-${config.key}`;
        value.textContent = config.isFecha ? SIN_FECHA : SIN_DATO;

        item.appendChild(label);
        item.appendChild(value);
        dataPanel.appendChild(item);
    });
}

export function updateDataPanel(registro) {
    const valores = {
        ...registro,
        fecha_hora_panel: formatearFecha(registro.fecha_hora),
        fecha_hora_sensor: formatearFecha(registro.fecha_hora_sensor_raw)
    };

    PANEL_CONFIG.forEach(config => {
        const element = document.getElementById(`experimento-${config.key}`);
        if (!element) return;

        if (config.isFecha) {
            element.textContent = valores[config.key];
        } else {
            const numero = parseFloat(valores[config.key]);
            element.textContent = isNaN(numero) ? SIN_DATO : numero.toFixed(2);
        }
    });
}
