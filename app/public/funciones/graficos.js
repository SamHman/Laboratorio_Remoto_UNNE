// Gráficos de Potencia AC + Irradiancia. Chart.js se carga como script global en SCADA.html.
// Una sola instancia por canvas: el gráfico del modal se crea una vez y se mantiene
// actualizado igual que el principal; al abrir el modal solo se redimensiona.

import { abrirModal } from './modales.js';
import { STALE_DATA_MS } from './config.js';

let mainChart = null;
let modalChart = null;
let datosGraficados = [];

const COLOR_INSTANTANEO = '#ef4444'; // mismo que .value.instantaneo en SCADA.CSS
const SOMBRA_INSTANTANEO = 'rgba(239, 68, 68, 0.1)'; // misma opacidad que las otras dos series
const DATASET_INSTANTANEO = 2;

function numeroONull(valor) {
    const numero = parseFloat(valor);
    return isNaN(numero) ? null : numero;
}

function toTimestamp(fechaHora) {
    return new Date(fechaHora.replace(' ', 'T')).getTime();
}

// Si el último punto real (el que manda el reloj es el del inversor, que es el que arma el
// eje) ya tiene más de STALE_DATA_MS, el inversor mismo dejó de mandar datos nuevos: en vez de
// dejar la curva "colgada" en el último valor real como si siguiera vigente, se agrega un punto
// sintético en el momento actual con Pac/irradiancia en 0. synthetic:true lo excluye del click.
function agregarPuntoStaleSiCorresponde(serie) {
    const ultimo = serie[serie.length - 1];
    if (!ultimo || (Date.now() - toTimestamp(ultimo.fecha_hora)) <= STALE_DATA_MS) return;

    const ahora = new Date();
    const pad = n => String(n).padStart(2, '0');
    serie.push({
        fecha_hora: `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`,
        fecha_hora_formatted: `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`,
        Pac: 0,
        irradiancia: 0,
        instantaneo: false,
        synthetic: true
    });
}

function createChartConfig(onClick) {
    return {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Potencia AC (W)',
                data: [],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                spanGaps: true // los huecos son las posiciones de los puntos instantáneos
            }, {
                label: 'Irradiancia (W/m²)',
                data: [],
                borderColor: '#00aaff',
                backgroundColor: 'rgba(0, 170, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                spanGaps: true,
                yAxisID: 'y1'
            }, {
                label: 'Potencia AC instantánea (W)',
                data: [],
                borderColor: COLOR_INSTANTANEO,
                backgroundColor: SOMBRA_INSTANTANEO,
                pointBackgroundColor: COLOR_INSTANTANEO,
                showLine: false,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick,
            scales: {
                x: {
                    ticks: { color: '#0000' },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: { color: '#0000' },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    ticks: { color: '#0000' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#0000',
                        // La serie instantánea solo figura mientras tiene puntos
                        filter: (item, data) => item.datasetIndex !== DATASET_INSTANTANEO
                            || data.datasets[DATASET_INSTANTANEO].data.some(v => v !== null)
                    }
                }
            }
        }
    };
}

export function initGraficos(onPointClick) {
    // Los dos datasets comparten índice, así que cualquier punto clickeado sirve.
    const onClick = (event, elements) => {
        if (elements.length === 0) return;
        const registro = datosGraficados[elements[0].index];
        if (registro && !registro.synthetic) onPointClick(registro);
    };

    mainChart = new Chart(document.getElementById('realTimeChart'), createChartConfig(onClick));
    modalChart = new Chart(document.getElementById('modalChart'), createChartConfig(onClick));
}

// datos = promedios de la base; instantaneos = lecturas en vivo tras una maniobra.
// Se intercalan por hora en un solo eje: cada serie deja null donde el punto es de la otra.
export function updateCharts(datos, instantaneos = []) {
    const serie = [...datos, ...instantaneos].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    agregarPuntoStaleSiCorresponde(serie);
    datosGraficados = serie;
    const labels = serie.map(r => r.fecha_hora_formatted);
    const pac = serie.map(r => r.instantaneo ? null : numeroONull(r.Pac));
    const irradiancia = serie.map(r => r.instantaneo ? null : numeroONull(r.irradiancia_stale ? 0 : r.irradiancia));
    const pacInstantaneo = serie.map(r => r.instantaneo ? numeroONull(r.Pac) : null);

    // Cada gráfico con sus propias copias: Chart.js engancha listeners a los arrays de datos
    [mainChart, modalChart].forEach(chart => {
        chart.data.labels = [...labels];
        chart.data.datasets[0].data = [...pac];
        chart.data.datasets[1].data = [...irradiancia];
        chart.data.datasets[DATASET_INSTANTANEO].data = [...pacInstantaneo];
        chart.update();
    });
}

export function abrirModalGrafico() {
    abrirModal(document.getElementById('chart-modal'));
    // Se creó con el modal oculto (tamaño 0): hay que recalcular al mostrarlo
    modalChart.resize();
}
