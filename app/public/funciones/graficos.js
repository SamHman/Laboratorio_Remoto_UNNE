// Gráficos de Potencia AC + Irradiancia. Chart.js se carga como script global en SCADA.html.
// Una sola instancia por canvas: el gráfico del modal se crea una vez y se mantiene
// actualizado igual que el principal; al abrir el modal solo se redimensiona.

import { abrirModal } from './modales.js';

let mainChart = null;
let modalChart = null;
let datosGraficados = [];

function numeroONull(valor) {
    const numero = parseFloat(valor);
    return isNaN(numero) ? null : numero;
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
                fill: true
            }, {
                label: 'Irradiancia (W/m²)',
                data: [],
                borderColor: '#00aaff',
                backgroundColor: 'rgba(0, 170, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick,
            scales: {
                x: {
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    ticks: { color: '#e0e0e0' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } }
            }
        }
    };
}

export function initGraficos(onPointClick) {
    // Los dos datasets comparten índice, así que cualquier punto clickeado sirve.
    const onClick = (event, elements) => {
        if (elements.length === 0) return;
        const registro = datosGraficados[elements[0].index];
        if (registro) onPointClick(registro);
    };

    mainChart = new Chart(document.getElementById('realTimeChart'), createChartConfig(onClick));
    modalChart = new Chart(document.getElementById('modalChart'), createChartConfig(onClick));
}

export function updateCharts(datos) {
    datosGraficados = datos;
    const labels = datos.map(r => r.fecha_hora_formatted);
    const pac = datos.map(r => numeroONull(r.Pac));
    const irradiancia = datos.map(r => numeroONull(r.irradiancia));

    // Cada gráfico con sus propias copias: Chart.js engancha listeners a los arrays de datos
    [mainChart, modalChart].forEach(chart => {
        chart.data.labels = [...labels];
        chart.data.datasets[0].data = [...pac];
        chart.data.datasets[1].data = [...irradiancia];
        chart.update();
    });
}

export function abrirModalGrafico() {
    abrirModal(document.getElementById('chart-modal'));
    // Se creó con el modal oculto (tamaño 0): hay que recalcular al mostrarlo
    modalChart.resize();
}
