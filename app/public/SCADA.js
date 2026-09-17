
// Constantes de configuración globales
const SERVER_UPDATE_INTERVAL = 30 * 1000;        // 30 segundos (actualización de datos del servidor - reducido para mejor respuesta)
const UI_UPDATE_INTERVAL = 10 * 1000;            // 10 segundos (actualización de la interfaz)
const DATA_INTERVAL = 10 * 1000;                 // 10 segundos (intervalo entre datos)
const CACHE_SIZE = 720; // 1 hora de datos a 10 segundos por punto

// Global state for user data
let userData = {
    username: 'Usuario'
};

// Estado del caché de datos
let cachedData = [];
let lastServerUpdate = 0;

// Function to update username display in header
function updateUsernameDisplay() {
    const usernameElement = document.getElementById('header-username');
    
    if (!usernameElement) {
        return;
    }
    
    // Update username text
    usernameElement.textContent = userData.username;
    usernameElement.style.display = 'inline';
}

// Function to fetch user data (simplificado - sin sistema de privilegios,
// y sin endpoint de servidor: no hay ruta que devuelva el usuario logueado
// a partir del JWT, así que se muestra el valor por defecto)
async function fetchUserData() {
    try {
        updateUsernameDisplay();
        return userData;
    } catch (error) {
        console.error('Error al obtener datos del usuario:', error);
        userData = { username: 'Usuario' };
        updateUsernameDisplay();
        return userData;
    }
}
// ===== Código del reloj digital =====
let relojInterval;
let lastSyncTime = 0;
const SYNC_INTERVAL = 30 * 60 * 1000; // Sincronizar cada 30 minutos

async function actualizarRelojArgentina() {
    try {
        const now = Date.now();
        
        // Sincronizar con el servidor periódicamente
        if (now - lastSyncTime > SYNC_INTERVAL) {
            await syncWithServerTime();
            lastSyncTime = now;
        }
        
        // Usar la hora local con el offset calculado
        const localTime = new Date(now + (timeOffset || 0));
        
        // Formatear la hora
        const hora = String(localTime.getHours()).padStart(2, '0');
        const minuto = String(localTime.getMinutes()).padStart(2, '0');
        const segundo = String(localTime.getSeconds()).padStart(2, '0');

        // Actualizar los elementos HTML
        const horaElement = document.getElementById('hora');
        const minutoElement = document.getElementById('minuto');
        const segundoElement = document.getElementById('segundo');
        const localizacionElement = document.getElementById('localizacion');
        
        if (horaElement) horaElement.textContent = hora;
        if (minutoElement) minutoElement.textContent = minuto;
        if (segundoElement) segundoElement.textContent = segundo;
        if (localizacionElement) localizacionElement.textContent = 'GMT-3 / UTC-3';
        
    } catch (error) {
        console.error('Error al actualizar el reloj:', error);
        // Usar hora local como respaldo
        const ahora = new Date();
        const opcionesHora = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'America/Argentina/Cordoba' // Misma zona que Corrientes
        };
        
        const horaArgentina = ahora.toLocaleTimeString('es-AR', opcionesHora);
        const partes = horaArgentina.split(':');
        
        const horaElement = document.getElementById('hora');
        const minutoElement = document.getElementById('minuto');
        const segundoElement = document.getElementById('segundo');
        const localizacionElement = document.getElementById('localizacion');
        
        if (horaElement) horaElement.textContent = partes[0];
        if (minutoElement) minutoElement.textContent = partes[1];
        if (segundoElement) segundoElement.textContent = partes[2];
        if (localizacionElement) localizacionElement.textContent = 'LOCAL';
    }
}

// Variable para almacenar el offset de tiempo
let timeOffset = 0;

// Función para sincronizar con la hora del servidor (deshabilitada - se usa hora local)
async function syncWithServerTime() {
    // No es necesario sincronizar, el navegador ya está sincronizado con la hora de Google
    timeOffset = 0;
    console.log('Usando hora local del navegador (sincronizada con Google)');
    return true;
}

// Iniciar el reloj
function iniciarReloj() {
    // Iniciar el reloj inmediatamente con hora local
    actualizarRelojArgentina();
    // Actualizar cada segundo
    clearInterval(relojInterval);
    relojInterval = setInterval(actualizarRelojArgentina, 1000);
}

// Iniciar el reloj cuando el documento esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarReloj);
} else {
    iniciarReloj();
}

// Iniciar el reloj cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Iniciar el reloj
    actualizarRelojArgentina();
    
    // Actualizar el reloj cada 1000 milisegundos (1 segundo)
    setInterval(actualizarRelojArgentina, 1000);
});

document.addEventListener('DOMContentLoaded', () => {
    // Fetch and display user data when page loads
    fetchUserData();
    
    const dataPanel = document.getElementById('data-panel');

    // Configuración del WebSocket para sincronización global
    const globalDataWebSocketUrl = `ws://${window.location.hostname}:${window.location.port}`;
    let globalDataWebSocket;
    
    // Inicializar conexión WebSocket para sincronización global
    function initGlobalDataWebSocket() {
        globalDataWebSocket = new WebSocket(globalDataWebSocketUrl);
        
        globalDataWebSocket.onopen = () => {
            console.log('Conexión WebSocket global establecida');
            relayManager.setConnectionStatus(true);
        };

        globalDataWebSocket.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'relay_status') {
                    relayManager.handleMessage(message);
                    return;
                }

                if (message.type === 'initial_data' || message.type === 'data_update') {
                    console.log(`Datos recibidos del servidor (${message.type})`);
                    
                    // Obtener datos de ambas tablas de forma independiente (no requieren sincronización)
                    const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
                    const [responseInversor, responseIrradiancia] = await Promise.all([
                        fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_inversor.php?limit=${CACHE_SIZE}`),
                        fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_irradiancia.php?limit=${CACHE_SIZE}`)
                    ]);
                    
                    if (responseInversor.ok && responseIrradiancia.ok) {
                        const resultInversor = await responseInversor.json();
                        const resultIrradiancia = await responseIrradiancia.json();
                        
                        if (resultInversor.status === 'ok' && resultIrradiancia.status === 'ok') {
                            
                            // Obtener el último valor de irradiancia disponible (se actualiza cada 5 min)
                            let lastIrradiancia = { temperatura: null, irradiancia: null, fecha_hora_sensor_raw: null };
                            if (resultIrradiancia.data && resultIrradiancia.data.length > 0) {
                                const lastItem = resultIrradiancia.data[resultIrradiancia.data.length - 1];
                                lastIrradiancia = {
                                    temperatura: lastItem.temperatura,
                                    irradiancia: lastItem.irradiancia,
                                    fecha_hora_sensor_raw: lastItem.fecha_hora
                                };
                            }
                            
                            // Combinar inversor + sensor por fecha más cercana
                            const combinedData = mergeByNearestSensor(
                                resultInversor.data || [],
                                resultIrradiancia.data || []
                            );
                            
                            if (combinedData.length > 0) {
                                processServerData(combinedData);
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.error('Error al procesar mensaje del servidor:', error);
            }
        };
        
        globalDataWebSocket.onclose = () => {
            console.log('Conexión WebSocket global cerrada, intentando reconectar...');
            relayManager.setConnectionStatus(false);
            setTimeout(initGlobalDataWebSocket, 5000);
        };

        globalDataWebSocket.onerror = (error) => {
            console.error('Error en la conexión WebSocket global:', error);
            globalDataWebSocket.close();
        };
    }

    // Variables para el manejo de datos en caché (ya declaradas globalmente)
    let lastServerUpdate = 0;

    

    // Configuración de datos del experimento (combinación de inversor y datos de irradiancia)
    const experimentoDataConfig = [
        { key: 'fecha_hora_panel', label: 'Fecha y Hora Inversor', unit: '', isSensor: false },
        { key: 'Vpv1', label: 'Vpv1 (V)', unit: 'V', isSensor: false },
        { key: 'Vpv2', label: 'Vpv2 (V)', unit: 'V', isSensor: false },
        { key: 'Ipv1', label: 'Ipv1 (A)', unit: 'A', isSensor: false },
        { key: 'Ipv2', label: 'Ipv2 (A)', unit: 'A', isSensor: false },
        { key: 'Vac1', label: 'Vac1 (V)', unit: 'V', isSensor: false },
        { key: 'Vac2', label: 'Vac2 (V)', unit: 'V', isSensor: false },
        { key: 'Vac3', label: 'Vac3 (V)', unit: 'V', isSensor: false },
        { key: 'Iac1', label: 'Iac1 (A)', unit: 'A', isSensor: false },
        { key: 'Iac2', label: 'Iac2 (A)', unit: 'A', isSensor: false },
        { key: 'Iac3', label: 'Iac3 (A)', unit: 'A', isSensor: false },
        { key: 'Fac1', label: 'Fac1 (Hz)', unit: 'Hz', isSensor: false },
        { key: 'Fac2', label: 'Fac2 (Hz)', unit: 'Hz', isSensor: false },
        { key: 'Fac3', label: 'Fac3 (Hz)', unit: 'Hz', isSensor: false },
        { key: 'Pac', label: 'Pac (W)', unit: 'W', isSensor: false },
        { key: 'EnergyToday', label: 'Energy Today (kWh)', unit: 'kWh', isSensor: false },
        { key: 'EnergyTotal', label: 'Energy Total (kWh)', unit: 'kWh', isSensor: false },
        { key: 'HourTotal', label: 'Horas Totales', unit: 'H', isSensor: false },
        { key: 'fecha_hora_sensor', label: 'Fecha y Hora Sensor', unit: '', isSensor: true },
        { key: 'temperatura', label: 'Temperatura (°C)', unit: '°C', isSensor: true },
        { key: 'irradiancia', label: 'Irradiancia (W/m²)', unit: 'W/m²', isSensor: true }
    ];

    // Generar elementos de datos del experimento
    experimentoDataConfig.forEach((config, index) => {
        const item = document.createElement('div');
        item.classList.add('data-item');

        const label = document.createElement('span');
        label.classList.add('label');
        label.textContent = config.label;

        const value = document.createElement('span');
        value.classList.add('value');
        value.id = `experimento-${config.key}`;
        value.textContent = '0.00';
        
        // Aplicar color celeste (#00aaff) a los datos del sensor
        if (config.isSensor) {
            value.style.color = '#00aaff';
        }

        item.appendChild(label);
        item.appendChild(value);
        dataPanel.appendChild(item);
    });

    // Función para actualizar datos del panel o Dashboard. clave
    function updateDataPanel(data) {
        if (!data) {
            console.log('No se proporcionaron datos para actualizar el panel');
            return;
        }
        
        // console.log('Actualizando panel con datos:', data);
        
        // Preprocesar la fecha y hora del inversor
        let fechaHoraPanel = '--/--/---- --:--:--';
        if (data.fecha_hora) {
            const d = new Date(data.fecha_hora);
            if (!isNaN(d.getTime())) {
                const dia = String(d.getDate()).padStart(2, '0');
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const anio = d.getFullYear();
                const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                fechaHoraPanel = `${dia}/${mes}/${anio} ${hora}`;
            }
        }
        // Asignar la fecha y hora del inversor al objeto de datos para el panel
        data.fecha_hora_panel = fechaHoraPanel;
        
        // Preprocesar la fecha y hora del sensor
        let fechaHoraSensor = '--/--/---- --:--:--';
        if (data.fecha_hora_sensor_raw) {
            const d = new Date(data.fecha_hora_sensor_raw);
            if (!isNaN(d.getTime())) {
                const dia = String(d.getDate()).padStart(2, '0');
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const anio = d.getFullYear();
                const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                fechaHoraSensor = `${dia}/${mes}/${anio} ${hora}`;
            }
        }
        // Asignar la fecha y hora del sensor al objeto de datos para el panel
        data.fecha_hora_sensor = fechaHoraSensor;
        
        // Debug: verificar procesamiento de fechas
        console.log('🔄 updateDataPanel procesando:', {
            fecha_hora_panel: fechaHoraPanel,
            fecha_hora_sensor: fechaHoraSensor,
            temperatura: data.temperatura,
            irradiancia: data.irradiancia
        });

        // Actualizar datos del experimento
        experimentoDataConfig.forEach(config => {
            const element = document.getElementById(`experimento-${config.key}`);
            if (element && data[config.key] !== undefined) {
                if (config.key === 'fecha_hora_panel' || config.key === 'fecha_hora_sensor') {
                    element.textContent = data[config.key];
                } else {
                    element.textContent = parseFloat(data[config.key]).toFixed(2);
                }
                // console.log(`Actualizado ${config.key}:`, data[config.key]);
            } else if (element) {
                // console.log(`Elemento no encontrado o dato no disponible: ${config.key}`);
            }
        });
    }

    // Función para crear configuración común de gráficos
    function createChartConfig() {
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
                onClick: handleChartClick,
                scales: {
                    x: {
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: { color: '#e0e0e0' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0'
                        }
                    }
                }
            }
        };
    }

    // Función para manejar clics en el gráfico
    function handleChartClick(event, elements) {
        if (!elements || elements.length === 0 || !cachedData || cachedData.length === 0) {
            return;
        }

        // --- Nuevo manejo: priorizar el punto del dataset del SENSOR (Irradiancia) ---
        // Dataset 0  -> Potencia AC (inversor)
        // Dataset 1  -> Irradiancia (sensor)
        // Si el usuario clickea cerca de ambas líneas, Chart.js puede devolver ambos elementos.
        // Queremos tomar primero el elemento del SENSOR para mostrar temperatura/irradiancia.
        const SENSOR_DATASET_IDX = 1; // mantener sincronizado con createChartConfig()
        let clickedElement = elements.find(el => el.datasetIndex === SENSOR_DATASET_IDX) || elements[0];
        const dataIndex = clickedElement.index;

        // Encontrar el dato correspondiente en cachedData
        // Los datos del gráfico están ordenados por fecha_hora
        const sortedData = [...cachedData].sort((a, b) => 
            new Date(a.fecha_hora) - new Date(b.fecha_hora)
        );

        if (dataIndex >= 0 && dataIndex < sortedData.length) {
            const clickedData = sortedData[dataIndex];
            
            // Debug: verificar datos antes de mostrar
            console.log('📍 Click en punto del gráfico:', {
                datasetIndex: clickedElement.datasetIndex,
                datasetName: clickedElement.datasetIndex === 0 ? 'Potencia AC' : 'Irradiancia',
                dataIndex: dataIndex,
                fecha_hora_inversor: clickedData.fecha_hora,
                fecha_hora_sensor: clickedData.fecha_hora_sensor_raw,
                temperatura: clickedData.temperatura,
                irradiancia: clickedData.irradiancia
            });
            
            // Mostrar los datos clickeados en el panel
            updateDataPanel(clickedData);
            
            // Activar el modo de visualización de datos clickeados
            isShowingClickedData = true;
            
            // Limpiar timeout anterior si existe
            if (clickedDataTimeout) {
                clearTimeout(clickedDataTimeout);
            }
            
            // Mostrar notificación temporal con ambas fechas
            const fechaInversor = new Date(clickedData.fecha_hora).toLocaleString('es-ES');
            const fechaSensor = clickedData.fecha_hora_sensor_raw 
                ? new Date(clickedData.fecha_hora_sensor_raw).toLocaleString('es-ES')
                : 'N/A';
            showNotification(`📊 Inversor: ${fechaInversor} | 🌡️ Sensor: ${fechaSensor}`, 'info');
            
            // Restaurar la visualización secuencial después de 10 segundos
            clickedDataTimeout = setTimeout(() => {
                isShowingClickedData = false;
                currentDataIndex = 0; // Reiniciar el contador
                showNotification('Volviendo a la visualización automática', 'info');
            }, 10000);
        }
    }

    // Main chart setup - Destruir chart existente si existe
    const mainCanvas = document.getElementById('realTimeChart');
    const mainCtx = mainCanvas.getContext('2d');
    
    // Destruir instancia previa si existe
    if (Chart.getChart(mainCanvas)) {
        Chart.getChart(mainCanvas).destroy();
    }
    const realTimeChart = new Chart(mainCtx, createChartConfig());

    // Modal chart setup - Destruir chart existente si existe
    const modalCanvas = document.getElementById('modalChart');
    const modalCtx = modalCanvas.getContext('2d');
    
    // Destruir instancia previa si existe
    if (Chart.getChart(modalCanvas)) {
        Chart.getChart(modalCanvas).destroy();
    }
    const modalChart = new Chart(modalCtx, createChartConfig());



    // Función para actualizar gráficos
    function updateCharts() {
        try {
            // console.log('Actualizando gráficos...');
            
            // Limpiar datos existentes
            realTimeChart.data.labels = [];
            realTimeChart.data.datasets[0].data = []; // Pac (W)
            realTimeChart.data.datasets[1].data = []; // Irradiancia (W/m²)
            modalChart.data.labels = [];
            modalChart.data.datasets[0].data = [];
            modalChart.data.datasets[1].data = [];

            // Verificar si hay datos en caché
            if (!cachedData || cachedData.length === 0) {
                // console.log('No hay datos en caché para graficar');
                return;
            }

            // Ordenar por fecha_hora
            const sortedData = [...cachedData].sort((a, b) => 
                new Date(a.fecha_hora) - new Date(b.fecha_hora)
            );

            // console.log(`Procesando ${sortedData.length} registros para el gráfico`);

            // Agregar datos al gráfico
            sortedData.forEach((record, index) => {
                try {
                    const fechaHora = record.fecha_hora || new Date().toISOString();
                    const timeLabel = new Date(fechaHora).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    const pacValue = parseFloat(record.Pac) || 0;
                    const irradianciaValue = parseFloat(record.irradiancia) || 0;
                    
                    // Agregar etiqueta de tiempo
                    realTimeChart.data.labels.push(timeLabel);
                    modalChart.data.labels.push(timeLabel);
                    
                    // Agregar valores numéricos directamente (labels ya definen el eje X)
                    realTimeChart.data.datasets[0].data.push(pacValue);
                    realTimeChart.data.datasets[1].data.push(irradianciaValue);
                    modalChart.data.datasets[0].data.push(pacValue);
                    modalChart.data.datasets[1].data.push(irradianciaValue);
                    
                    // console.log(`Registro ${index + 1}:`, { timeLabel, pacValue, irradianciaValue });
                } catch (error) {
                    console.error(`Error procesando registro ${index}:`, error);
                }
            });
            
            // Mostrar todos los puntos (hasta 720)
            // No es necesario limitar aquí ya que ya limitamos en processServerData

            // console.log('Actualizando gráficos con datos:', {
            //     labels: realTimeChart.data.labels.length,
            //     pacData: realTimeChart.data.datasets[0].data.length,
            //     irradianciaData: realTimeChart.data.datasets[1].data.length
            // });
            
            // Actualizar los gráficos
            realTimeChart.update();
            modalChart.update();
            // console.log('Gráficos actualizados exitosamente');
            
        } catch (error) {
            console.error('Error en updateCharts:', error);
        }
    }

    // Variables para el manejo de datos en el panel
    let lastUIUpdateTime = 0;
    let isShowingClickedData = false;
    let clickedDataTimeout = null;
    // Índice usado por otros fragmentos para avanzar secuencialmente
    let currentDataIndex = 0;
    
    // Función para actualizar la UI con el último dato en caché
    function updateUIFromCache() {
        const now = Date.now();
        
        // Evitar actualizaciones si estamos mostrando datos de un clic
        if (isShowingClickedData) {
            return;
        }
        
        // Evitar múltiples ejecuciones simultáneas (throttling)
        if (now - lastUIUpdateTime < UI_UPDATE_INTERVAL) {
            return;
        }
        lastUIUpdateTime = now;

        if (!cachedData || cachedData.length === 0) {
            return;
        }
        
        try {
            // Obtener solo el último dato cargado
            const lastData = cachedData.slice(-1);
            
            if (lastData.length === 0) {
                return;
            }
            
            // Mostrar el último dato
            const currentData = lastData[0];
            
            if (currentData) {
                // Actualizar el panel de datos
                updateDataPanel(currentData);
                
                // Usar un evento personalizado con burbujeo para mejor rendimiento
                const event = document.createEvent('Event');
                event.initEvent('data-updated', true, true);
                document.dispatchEvent(event);
            }
        } catch (error) {
            console.error('Error al actualizar la UI desde la caché:', error);
        }
    }

    // Función utilitaria: fusiona cada registro del inversor con la lectura de sensor más reciente (<= fecha)
    function mergeByNearestSensor(inversorArr, sensorArr) {
        if (!Array.isArray(inversorArr) || !Array.isArray(sensorArr)) return [];
        // Ordenar ambos arreglos por fecha ascendente
        const sensors = [...sensorArr].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
        let sPtr = 0;
        return inversorArr.map(inv => {
            const tInv = new Date(inv.fecha_hora);
            // Avanzar el puntero mientras el siguiente sensor sea <= fecha inversor
            while (sPtr + 1 < sensors.length && new Date(sensors[sPtr + 1].fecha_hora) <= tInv) {
                sPtr++;
            }
            const sensor = sensors[sPtr] || {};
            return {
                ...inv,
                temperatura: sensor.temperatura ?? null,
                irradiancia: sensor.irradiancia ?? null,
                fecha_hora_sensor_raw: sensor.fecha_hora ?? null
            };
        });
    }

    // Función para procesar los datos recibidos del servidor
    function processServerData(data) {
        if (data && data.length > 0) {
            // Ordenar los datos por fecha_hora (más antiguo a más reciente)
            const sortedData = [...data].sort((a, b) => 
                new Date(a.fecha_hora) - new Date(b.fecha_hora)
            );
            // Acumular datos nuevos
            cachedData = [...cachedData, ...sortedData];
            // Limitar a los últimos 720 puntos
            if (cachedData.length > 720) {
                cachedData = cachedData.slice(-720);
            }
            lastServerUpdate = Date.now();
            console.log(`Datos actualizados desde servidor. Total de registros: ${cachedData.length}`);
            
            // Actualizar gráficos inmediatamente con el historial completo
            updateCharts();
            // Luego actualizar la UI (panel) para avanzar según el reloj
            updateUIFromCache();
        }
    }

    // Función para obtener datos del servidor (solo para carga inicial)
    async function fetchInitialData() {
        try {
            console.log('Cargando datos iniciales...');
            // Obtener datos de ambas tablas de forma independiente
            const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
            const responseInversor = await fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_inversor.php?limit=${CACHE_SIZE}`);
            const responseIrradiancia = await fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_irradiancia.php?limit=${CACHE_SIZE}`);
            
            if (responseInversor.ok && responseIrradiancia.ok) {
                const resultInversor = await responseInversor.json();
                const resultIrradiancia = await responseIrradiancia.json();
                
                if (resultInversor.status === 'ok' && resultIrradiancia.status === 'ok') {
                    
                    // Obtener el último valor de irradiancia disponible (se actualiza cada 5 min)
                    let lastIrradiancia = { temperatura: null, irradiancia: null, fecha_hora_sensor_raw: null };
                    if (resultIrradiancia.data && resultIrradiancia.data.length > 0) {
                        const lastItem = resultIrradiancia.data[resultIrradiancia.data.length - 1];
                        lastIrradiancia = {
                            temperatura: lastItem.temperatura,
                            irradiancia: lastItem.irradiancia,
                            fecha_hora_sensor_raw: lastItem.fecha_hora
                        };
                    }
                    
                    // Combinar inversor + sensor por fecha más cercana
                    const combinedData = mergeByNearestSensor(
                        resultInversor.data || [],
                        resultIrradiancia.data || []
                    );
                    
                    if (combinedData.length > 0) {
                        processServerData(combinedData);
                    } else {
                        console.warn('No hay datos del inversor disponibles');
                    }
                } else {
                    console.error('Error en la respuesta del servidor:', resultInversor.message || resultIrradiancia.message || 'Respuesta inesperada');
                }
            } else {
                console.error('Error al obtener datos del servidor. Inversor:', responseInversor.status, 'Irradiancia:', responseIrradiancia.status);
            }
        } catch (error) {
            console.error('Error al obtener datos iniciales:', error);
        }
    }

    // La UI ahora se actualiza solo cuando llegan datos nuevos del servidor
    
    // Inicializar WebSocket global
    initGlobalDataWebSocket();
    
    // Cargar datos iniciales (solo una vez)
    fetchInitialData();
    
    // SOLUCIÓN AL RETRASO: Agregar polling cada 30 segundos como respaldo
    setInterval(async () => {
        console.log('Verificando nuevos datos (polling de respaldo)...');
        try {
            const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
            const [responseInversor, responseIrradiancia] = await Promise.all([
                fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_inversor.php?limit=${CACHE_SIZE}`),
                fetch(`${baseUrl}/LabVirtualUNNE/app/api/obtener_datos_irradiancia.php?limit=${CACHE_SIZE}`)
            ]);
            
            if (responseInversor.ok && responseIrradiancia.ok) {
                const resultInversor = await responseInversor.json();
                const resultIrradiancia = await responseIrradiancia.json();
                
                if (resultInversor.status === 'ok' && resultIrradiancia.status === 'ok') {
                    // Obtener el último valor de irradiancia disponible
                    let lastIrradiancia = { temperatura: null, irradiancia: null, fecha_hora_sensor_raw: null };
                    if (resultIrradiancia.data && resultIrradiancia.data.length > 0) {
                        const lastItem = resultIrradiancia.data[resultIrradiancia.data.length - 1];
                        lastIrradiancia = {
                            temperatura: lastItem.temperatura,
                            irradiancia: lastItem.irradiancia,
                            fecha_hora_sensor_raw: lastItem.fecha_hora
                        };
                    }
                    
                    // Combinar datos inversor + sensor por fecha cercana
                    const combinedData = mergeByNearestSensor(
                        resultInversor.data || [],
                        resultIrradiancia.data || []
                    );
                    
                    if (combinedData.length > 0) {
                        processServerData(combinedData);
                    }
                }
            }
        } catch (error) {
            console.error('Error en polling de respaldo:', error);
        }
    }, 30000); // Cada 30 segundos

    /////////////// Interacción USUARIO - Botones ////////////////
    // Obtener referencias a los elementos del modal
    const exportModal = document.getElementById('export-modal');
    const chartModal = document.getElementById('chart-modal');
    const exportIcon = document.getElementById('export-icon');
    const closeButtons = document.querySelectorAll('.close-button');
    const chartCanvas = document.getElementById('realTimeChart');
    
    // Conectar botón de expansión del gráfico (ya existe en el HTML)
    const expandButton = document.querySelector('.expand-btn');
    if (expandButton) {
        expandButton.addEventListener('click', openChartModal);
    }

    // Función para abrir el modal de exportación
    function openExportModal() {
        exportModal.style.display = 'flex';
    }

    // Función para abrir el modal del gráfico
    function openChartModal() {
        const modalChart = document.getElementById('modalChart');
        if (!modalChart) {
            console.error('No se encontró el elemento del gráfico modal');
            return;
        }
        
        const modalCtx = modalChart.getContext('2d');
        if (!modalCtx) {
            console.error('No se pudo obtener el contexto 2D del canvas');
            return;
        }
        
        // Mostrar el modal inmediatamente para mejor experiencia de usuario
        chartModal.style.display = 'flex';
        
        // Obtener la instancia del gráfico del objeto global Chart
        const chartInstances = Chart.instances;
        const realTimeChart = Array.from(chartInstances).find(
            chart => chart.canvas.id === 'realTimeChart'
        );
        
        // Si ya hay un gráfico en el modal, destruirlo
        if (window.modalChartInstance) {
            window.modalChartInstance.destroy();
        }
        
        // Si no hay datos del gráfico principal, mostrar gráfico vacío
        if (!realTimeChart || !realTimeChart.data) {
            console.log('No hay datos del gráfico principal disponibles');
            window.modalChartInstance = new Chart(modalCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Pac (W)',
                        data: [],
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2,
                        fill: false
                    }, {
                        label: 'Irradiancia (W/m²)',
                        data: [],
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 2,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    animation: { duration: 0 }
                }
            });
            return;
        }
        
        try {
            // Crear una copia profunda de los datos del gráfico
            const chartData = {
                labels: realTimeChart.data.labels ? [...realTimeChart.data.labels] : [],
                datasets: realTimeChart.data.datasets ? realTimeChart.data.datasets.map(dataset => ({
                    ...dataset,
                    data: [...dataset.data],
                    backgroundColor: dataset.backgroundColor,
                    borderColor: dataset.borderColor,
                    pointBackgroundColor: dataset.pointBackgroundColor,
                    borderWidth: dataset.borderWidth || 2,
                    fill: dataset.fill || false
                })) : []
            };
            
            // Crear una copia de las opciones del gráfico
            const chartOptions = {
                ...realTimeChart.options,
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                animation: { duration: 0 },
                plugins: {
                    ...realTimeChart.options.plugins,
                    legend: { display: true, position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    ...realTimeChart.options.scales,
                    y: {
                        beginAtZero: false,
                        ticks: { precision: 2 }
                    }
                }
            };
            
            // Crear el nuevo gráfico en el modal
            window.modalChartInstance = new Chart(modalCtx, {
                type: 'line',
                data: chartData,
                options: chartOptions
            });
            
        } catch (error) {
            console.error('Error al abrir el gráfico en pantalla completa:', error);
            // No mostrar alerta al usuario, solo registrar el error
        }
    }

    // Función para cerrar modales
    function closeModal(modal) {
        modal.style.display = 'none';
    }

    // Event Listeners para abrir modales
    if (exportIcon) {
        exportIcon.addEventListener('click', openExportModal);
    }

    // Cerrar modales al hacer clic en el botón de cerrar
    closeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal);
        });
    });

    // Cerrar modales al hacer clic fuera del contenido
    window.addEventListener('click', (e) => {
        if (e.target === exportModal) {
            closeModal(exportModal);
        }
        if (e.target === chartModal) {
            closeModal(chartModal);
        }
    });

    // Variables globales para notificaciones de dashboard
    let dashboardUpdateNotification;
    let dashboardUpdateInterval;

    // Función global para ocultar notificación de progreso de actualización del dashboard
    window.hideDashboardUpdateProgress = () => {
        if (dashboardUpdateInterval) {
            clearInterval(dashboardUpdateInterval);
            dashboardUpdateInterval = null;
        }
        if (dashboardUpdateNotification && dashboardUpdateNotification.parentNode) {
            document.body.removeChild(dashboardUpdateNotification);
            dashboardUpdateNotification = null;
        }
        // Limpiar flag de localStorage
        localStorage.removeItem('dashboardUpdateInProgress');
    };

    // Limpiar notificaciones residuales al cargar la página (ejecutar inmediatamente)
    (function cleanupOnLoad() {
        // Limpiar cualquier elemento DOM residual
        const existingNotif = document.getElementById('dashboard-update-progress-notif');
        if (existingNotif) {
            existingNotif.remove();
        }
        // Limpiar flag de localStorage si existe
        localStorage.removeItem('dashboardUpdateInProgress');
    })();

    // Limpiar notificaciones antes de refrescar o cerrar la página
    window.addEventListener('beforeunload', () => {
        window.hideDashboardUpdateProgress();
    });

    // También limpiar cuando la página se vuelve visible (por si acaso)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Verificar si hay una notificación huérfana
            const existingNotif = document.getElementById('dashboard-update-progress-notif');
            if (existingNotif && !dashboardUpdateInterval) {
                existingNotif.remove();
            }
        }
    });


window.showDashboardUpdateProgress = (tiempoSegundos) => {
    // Limpiar cualquier notificación residual antes de crear una nueva
    window.hideDashboardUpdateProgress();
    
    // Evitar crear múltiples notificaciones
    if (dashboardUpdateNotification && dashboardUpdateNotification.parentNode) {
        return;
    }
    
    dashboardUpdateNotification = document.createElement('div');
    dashboardUpdateNotification.id = 'dashboard-update-progress-notif';
    dashboardUpdateNotification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        min-width: 280px;
        animation: slideIn 0.3s ease-out;
    `;
    // Usamos la variable 'tiempoSegundos' para establecer el valor inicial de la cuenta regresiva.
    dashboardUpdateNotification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div>
                <div style="font-size: 14px;">Actualizando datos en la dashboard...</div>
                <div id="dashboard-countdown-text" style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Tiempo estimado: <span id="dashboard-countdown-value">${tiempoSegundos}</span>s</div>
            </div>
        </div>
    `;
    document.body.appendChild(dashboardUpdateNotification);
    
    // Marcar en localStorage que hay una notificación activa
    localStorage.setItem('dashboardUpdateInProgress', 'true');

    // Iniciar contador en reversa
    dashboardUpdateInterval = setInterval(() => {
        const countdownElement = document.getElementById('dashboard-countdown-value');
        if (countdownElement) {
            const countdown = parseInt(countdownElement.textContent);
            if (countdown > 0) {
                countdownElement.textContent = countdown - 1;
            } else {
                // Ocultar la notificación al finalizar la cuenta
                window.hideDashboardUpdateProgress();
            }
        }
    }, 1000);
};


window.hideDashboardUpdateProgress = () => {
    if (dashboardUpdateInterval) {
        clearInterval(dashboardUpdateInterval);
    }
    if (dashboardUpdateNotification && dashboardUpdateNotification.parentNode) {
        dashboardUpdateNotification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (dashboardUpdateNotification && dashboardUpdateNotification.parentNode) {
                document.body.removeChild(dashboardUpdateNotification);
                dashboardUpdateNotification = null;
            }
        }, 300);
    }
};

// Global variables for inverter fault notification
let inverterFaultNotification = null;
let inverterFaultInterval = null;

// Función para mostrar notificación de fallo del inversor
window.InverterFaultProgress = (isConnected) => {
    // Si el relay está conectado
    if (isConnected) {
        // Mostrar notificación solo si no estaba conectado antes
        if (inverterFaultNotification === null) {
            // Ocultar cualquier notificación existente
            window.hideInverterFaultProgress();
            
            // Crear nueva notificación
            inverterFaultNotification = document.createElement('div');
            inverterFaultNotification.id = 'inverter-fault-progress';
            inverterFaultNotification.style.cssText = `
                position: fixed;
                top: 100px;
                left: 20px;
                background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-weight: bold;
                z-index: 9998;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                min-width: 280px;
                opacity: 0.9;
                animation: slideIn 0.3s ease-out;
            `;

            let countdown = 420; // 5 minutos con 10 seg Inversor + 90 segundos instaBot
            inverterFaultNotification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <div>
                        <div style="font-size: 14px;">Inversor en modo Fault esperando 420 segundos para la reconexión</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
                            Reconectando en: <span id="inverter-countdown-value">${countdown}</span>s
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(inverterFaultNotification);

            // Iniciar cuenta regresiva
            inverterFaultInterval = setInterval(() => {
                countdown--;
                const countdownElement = document.getElementById('inverter-countdown-value');
                if (countdownElement) {
                    countdownElement.textContent = countdown;
                }
                
                if (countdown <= 0) {
                    window.hideInverterFaultProgress();
                }
            }, 1000);
        }
    } else {
        // Si el relay está desconectado, ocultar la notificación
        window.hideInverterFaultProgress();
    }
};

// Función para ocultar la notificación de fallo del inversor
window.hideInverterFaultProgress = () => {
    if (inverterFaultInterval) {
        clearInterval(inverterFaultInterval);
        inverterFaultInterval = null;
    }
    
    if (inverterFaultNotification && inverterFaultNotification.parentNode) {
        inverterFaultNotification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (inverterFaultNotification && inverterFaultNotification.parentNode) {
                document.body.removeChild(inverterFaultNotification);
                inverterFaultNotification = null;
            }
        }, 300);
    }
};

// NOTA: window.iniciarActualizacionDashboard() se retiró junto con
// flag_bot_trabajando.php y ciclo_automatizado.bat (dependía del flag de
// archivo que escribía el bot Python viejo, que ya no existe). Su único
// llamador era registrarOrdenRelay(), también retirado.


    // Manejar la exportación de datos
    document.getElementById('confirm-export-btn')?.addEventListener('click', async () => {
        console.log('[EXPORT] Iniciando proceso de exportación...');
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;
        
        console.log('[EXPORT] Valores de fecha:', { startTime, endTime });
        
        if (!startTime || !endTime) {
            console.error('[EXPORT] Error: Fechas no válidas');
            showNotification('Por favor seleccione un rango de fechas válido', 'error');
            return;
        }

        // Formatear a formato MySQL DATETIME si es necesario, si se altera esto tanto para php como en js. perdemos datos
        const start = startTime.replace('T', ' ');
        const end = endTime.replace('T', ' ');
        console.log('[EXPORT] Fechas formateadas:', { start, end });

        // Validar que el rango no sea mayor a 1 semana (7 días)
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffInMs = endDate - startDate;
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        if (diffInDays > 7) {
            console.error('[EXPORT] Error: Rango mayor a 1 semana');
            showNotification('El rango de fechas no puede ser mayor a 1 semana (7 días)', 'error');
            return;
        }
        
        if (diffInDays < 0) {
            console.error('[EXPORT] Error: Fecha inicial mayor que fecha final');
            showNotification('La fecha inicial no puede ser mayor que la fecha final', 'error');
            return;
        }

        // Mostrar contador en reversa durante la exportación  Recervado para El modo Fault
        let countdown = 60; // Tiempo estimado en segundos (ajustar según necesidad)
        let countdownInterval;
        let exportNotification;
        
        // Crear notificación de progreso de exportación
        const showExportProgress = () => {
            exportNotification = document.createElement('div');
            exportNotification.id = 'export-progress-notif';
            exportNotification.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                font-weight: bold;
                z-index: 10000;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                min-width: 280px;
                animation: slideIn 0.3s ease-out;
            `;
            exportNotification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <div>
                        <div style="font-size: 14px;">Exportando datos a Excel...</div>
                        <div id="countdown-text" style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Tiempo estimado: <span id="countdown-value">${countdown}</span>s</div>
                    </div>
                </div>
            `;
            document.body.appendChild(exportNotification);
            
            // Iniciar contador en reversa
            countdownInterval = setInterval(() => {
                countdown--;
                const countdownElement = document.getElementById('countdown-value');
                if (countdownElement) {
                    countdownElement.textContent = countdown;
                    if (countdown <= 0) {
                        countdownElement.parentElement.textContent = 'Finalizando...';
                        clearInterval(countdownInterval);
                    }
                }
            }, 1000);
        };

        // Función para ocultar notificación de progreso de exportación
        const hideExportProgress = () => {
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
            if (exportNotification && exportNotification.parentNode) {
                exportNotification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    if (exportNotification.parentNode) {
                        document.body.removeChild(exportNotification);
                    }
                }, 300);
            }
        };

        try { // Usar host del navegador pero sin el puerto (para ir a Apache)
            showExportProgress(); // Mostrar contador antes de iniciar la exportación
            
            const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
            const apiUrl = `${baseUrl}/LabVirtualUNNE/app/api/exportar_datos_dashboard.php`;
            console.log('[EXPORT] URL de API:', apiUrl);
            console.log('[EXPORT] Payload:', JSON.stringify({ start, end }));
            
            const requestStart = Date.now();
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start, end })
            });
            const requestDuration = Date.now() - requestStart;
            console.log(`[EXPORT] Respuesta recibida en ${requestDuration}ms`);
            console.log('[EXPORT] Status:', response.status, response.statusText);

            hideExportProgress(); // Ocultar contador al recibir respuesta

            const contentType = response.headers.get('Content-Type');
            console.log('[EXPORT] Content-Type:', contentType);
            console.log('[EXPORT] Response headers:', Array.from(response.headers.entries()));
            
            if (contentType && contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                console.log('[EXPORT] Archivo Excel detectado, iniciando descarga...');
                // Descargar el archivo Excel
                const blob = await response.blob();
                console.log('[EXPORT] Blob creado, tamaño:', blob.size, 'bytes');
                const url = window.URL.createObjectURL(blob);
                console.log('[EXPORT] URL de descarga creada:', url);
                const a = document.createElement('a');
                a.href = url;
                
                // Crear nombre personalizado del archivo de excel
                const formatDate = (dateString) => {
                    const date = new Date(dateString);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    return `${day}-${month}-${year} ${hours}-${minutes}`;
                };
                
                const startFormatted = formatDate(startTime);
                const endFormatted = formatDate(endTime);
                const filename = `Mediciones_${startFormatted}_${endFormatted}.xlsx`;
                
                a.download = filename;
                console.log('[EXPORT] Nombre de archivo:', filename);
                document.body.appendChild(a);

                // Usar un enfoque más confiable para descargar
                try {
                    a.click();
                    console.log('[EXPORT] Click en enlace de descarga ejecutado');

                    // Verificar si la descarga se inició correctamente
                    setTimeout(() => {
                        if (document.body.contains(a)) {
                            console.log('[EXPORT] Descarga puede haber fallado, intentando método alternativo...');
                            // Método alternativo: abrir en nueva ventana si el click no funcionó
                            window.open(url, '_blank');
                        }
                    }, 1000);

                } catch (clickError) {
                    console.error('[EXPORT] Error en click programático, usando ventana nueva:', clickError);
                    // Método alternativo: abrir en nueva ventana
                    window.open(url, '_blank');
                }

                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    console.log('[EXPORT] Limpieza completada');
                }, 100);
                showNotification('Datos exportados exitosamente', 'success');
                console.log('[EXPORT] Exportación completada exitosamente');
            } else {
                console.log('[EXPORT] Respuesta no es Excel, intentando leer como JSON...');
                // Leer el JSON de error
                try {
                    const data = await response.json();
                    console.log('[EXPORT] Respuesta JSON:', data);
                    showNotification(data.message || 'No existen datos en el intervalo seleccionado.', 'warning');
                } catch (jsonError) {
                    console.error('[EXPORT] Error al parsear JSON:', jsonError);
                    const textResponse = await response.text();
                    console.error('[EXPORT] Respuesta como texto:', textResponse.substring(0, 500));
                    showNotification('Error al procesar la respuesta del servidor', 'error');
                }
            }
        } catch (error) {
            console.error('[EXPORT] Error capturado:', error);
            console.error('[EXPORT] Stack trace:', error.stack);
            console.error('[EXPORT] Tipo de error:', error.name);
            hideExportProgress(); // Ocultar contador en caso de error
            showNotification('Error al exportar: ' + error.message, 'error');
        }

        // Cerrar el modal después de exportar
        console.log('[EXPORT] Cerrando modal de exportación');
        closeModal(exportModal);
    });
});


// === Lógica de Control de los Relays ===
document.addEventListener('DOMContentLoaded', () => {

    // Función para actualizar el estado visual y texto de un relay, se declaran todos los posibles casos
    function updateRelayVisual(id, state) {
        const block = document.getElementById('block-' + id);
        const img = document.getElementById(id);
        const status = document.getElementById('status-' + id);
        if (!block || !img || !status) return;
        block.classList.remove('on', 'off', 'disconnected');
        if (state === 'on') {
            img.src = 'images/Relay_ON.png';
            block.classList.remove('relay-disconnected');
            img.classList.remove('relay-disconnected');
            status.textContent = 'ON';
            status.classList.remove('off', 'disconnected');
            status.classList.add('on');
            block.classList.add('on');
        } else if (state === 'off') {
            img.src = 'images/Relay_OFF.png'; //utiliza la misma imagen que relay_off pero con rojo oscuro
            block.classList.remove('relay-disconnected');
            img.classList.remove('relay-disconnected');
            status.textContent = 'OFF';
            status.classList.remove('on', 'disconnected');
            status.classList.add('off');
            block.classList.add('off');
        } else if (state === 'disconnected') {
            img.src = 'images/Relay_OFF.png';
            block.classList.add('relay-disconnected');
            img.classList.add('relay-disconnected');
            status.textContent = 'Desconectado';
            status.classList.remove('on', 'off');
            status.classList.add('disconnected');
            block.classList.add('disconnected');
        }
    }



    // Configuración centralizada de relays. El ESP32 ya no es alcanzable directo
    // desde el navegador (vive en la LAN de la facultad); el agente-puente on-prem
    // es quien le habla, y acá solo necesitamos el mapeo a los elementos del DOM.
	const relayConfig = {
		relays: {
			1: { elementId: 'esp8266-top' },
			2: { elementId: 'esp8266-bottom' },
			3: { elementId: 'esp8266-right' }
		}
	};
    
    // Tiempo de cooldown en milisegundos
    const BUTTON_COOLDOWN_MS = 5000; // 5 segundos

    // Función para actualizar la apariencia visual de los botones, se la invoca en el bloqueo
    function updateButtonState(elementId, isEnabled) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (isEnabled) {
            element.classList.remove('disabled');
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
            element.style.pointerEvents = 'auto';
        } else {
            element.classList.add('disabled');
            element.style.opacity = '0.7';
            element.style.cursor = 'not-allowed';
            element.style.pointerEvents = 'none';
        }
    }
    
    // Verificación de privilegios eliminada - Todos los usuarios tienen acceso completo


// Gestión centralizada del estado de los relés (llega vía WS de navegador / API de Node)
const relayManager = {
    // Estado de conexión global: ahora refleja el WebSocket de navegador
    // (globalDataWebSocket), no una conexión directa al ESP32.
    isConnectedGlobal: false,

    setConnectionStatus(connected) {
        this.isConnectedGlobal = connected;
        Object.keys(relayConfig.relays).forEach(num => {
            const config = relayConfig.relays[num];
            updateRelayVisual(config.elementId, connected ? (this.relayStates[num] || 'off') : 'disconnected');
        });
        this.updateInverterState();
    },

    // Protección para la desconexión del Inversor (El inversor no se debe apagar!) Agregar una 3er subrutina de proteccion
    checkEmergencyManeuver(relayNum, command) {
        try {
            // Solo aplica a órdenes de apagado
            if (command !== 'relay_off') return true;

            // Últimos estados conocidos (del JSON recibido)
            const isRelay1On = this.relayStates[1] === 'on';
            const isRelay2On = this.relayStates[2] === 'on';
            const isRelay3On = this.relayStates[3] === 'on';

            if (!isRelay3On) return true; // Si R3 está OFF, no hay bloqueo

            // Caso 1: Se intenta apagar R2 cuando R1=OFF y R2=ON y R3=ON
            if (relayNum === 2 && !isRelay1On && isRelay2On) {
                if (typeof showNotification === 'function') {
                    showNotification('Debes primero desconectar la Alterna', 'error');
                }
                return false;
            }

            // Caso 2: Se intenta apagar R1 cuando R2=OFF y R1=ON y R3=ON
            if (relayNum === 1 && !isRelay2On && isRelay1On) {
                if (typeof showNotification === 'function') {
                    showNotification('Debes primero desconectar la Alterna', 'error');
                }
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error en checkEmergencyManeuver:', error);
            return true; // En caso de error, no bloquear
        }
    },
    checkCommissioningManeuver(relayNum, command){
        try {
            // Solo aplica cuando se intenta encender
            if (command !== 'relay_on') return true;

            // Regla: Solo permitir encender el Relay 3 si Relay 1 o Relay 2 están en ON
            if (relayNum === 3) {
                const isRelay1On = this.relayStates[1] === 'on';
                const isRelay2On = this.relayStates[2] === 'on';
                const allowed = isRelay1On || isRelay2On;
                if (!allowed) {
                    if (typeof showNotification === 'function') {
                        showNotification('No se puede conectar el Inversor a la Alterna sin previamente la Alimentación de Continua', 'error');
                    }
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error en checkCommissioningManeuver:', error);
            return true; // En caso de error, no bloquear por seguridad operativa
        }
    },
    //Proteccion debido a que estamos en el Modo Caracterización
    checkDisconnectionManeuver(relayNum, command){
        try {
            // Solo aplica a órdenes de apagado
            if (command !== 'relay_off') return true;

            // Últimos estados conocidos (del JSON recibido)
            const isRelay1On = this.relayStates[1] === 'on';
            const isRelay2On = this.relayStates[2] === 'on';
            const isRelay3On = this.relayStates[3] === 'on';

            // Caso 1: Si relay 3 está apagado Y relay 1 apagado Y se desea apagar relay 2
            if (!isRelay3On && !isRelay1On && relayNum === 2) {
                if (typeof showNotification === 'function') {
                    showNotification('No está permitido apagar el Inversor', 'error');
                }
                return false;
            }

            // Caso 2: Si relay 2 apagado Y se desea apagar relay 1
            if (!isRelay2On && relayNum === 1) {
                if (typeof showNotification === 'function') {
                    showNotification('No está permitido apagar el Inversor', 'error');
                }
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error en checkDisconnectionManeuver:', error);
            return true; // En caso de error, no bloquear
        }
    },
    //Objeto que almacena el estado actual de cada relay
    relayStates: {},
    //Objeto que almacena el estado de cooldown para cada botón
    buttonCooldowns: {},
    //Asegura que los event listeners estén configurados antes de intentar cualquier interacción con los relés.
    //Conexión Automática: Establece automáticamente la conexión con todos los relés configurados al cargar la página.
    //Escalabilidad: Funciona con cualquier número de relés definidos en relayConfig, sin necesidad de modificar el código
    async init() {
        // Inicializar estados de relay como 'on' por defecto (Porque estámos conectados al terminal normalmente cerrado) 
        this.relayStates = {
            1: 'on',
            2: 'on',
            3: 'on'
        };
        
        await this.initEventListeners();
        // El estado de conexión y de los relés ya no se piden a un socket propio:
        // llegan por el WebSocket de navegador compartido (ver initGlobalDataWebSocket).
    },
    // Inicializar event listeners para los botones de relays
    async initEventListeners() {
        Object.keys(relayConfig.relays).forEach(relayNum => {
            const num = parseInt(relayNum);
            const config = relayConfig.relays[num];
            if (!config) return;
            
            const element = document.getElementById(config.elementId);
            if (element) {
                // Agregar el manejador de eventos
                element.addEventListener('click', async () => {
                    await this.toggleRelay(num);
                });
            }
        });
    },
    // Update inverter state based on Relay 3 state  
    updateInverterState() {
        const relay1State = this.relayStates[1] === 'on';
        const relay2State = this.relayStates[2] === 'on';
        const relay3State = this.relayStates[3] === 'on';
        const inverterElement = document.getElementById('goodwe-inverter');
        const inverterStatus = document.getElementById('status-goodwe-inverter');
        const inverterBlock = document.getElementById('block-goodwe-inverter');
        
        if (!inverterElement || !inverterStatus || !inverterBlock) return;
        
        // Guardar estado previo para detectar cambios
        const previousState = inverterStatus.textContent;
        
        // Estado FAULT: Relay 3 está OFF
        if (!relay3State) {
            inverterElement.src = 'images/Inverter_Fault.png';
            inverterStatus.textContent = 'FAULT';
            inverterElement.classList.add('fault');
            inverterElement.classList.remove('on', 'off');
            inverterBlock.classList.add('fault');
            inverterBlock.classList.remove('on', 'off');
            // Quitar cualquier estilo de margen personalizado
            inverterElement.style.border = 'none';
            inverterBlock.style.border = 'none';
            
        }
        // Estado ON: Relay 3 está ON
        else if (relay3State) {
            inverterElement.src = 'images/Inverter_ON.png';
            inverterStatus.textContent = 'ON';
            inverterElement.classList.add('on');
            inverterElement.classList.remove('off', 'fault');
            inverterBlock.classList.add('on');
            inverterBlock.classList.remove('off', 'fault');
            // Quitar margen en estado ON
            inverterElement.style.border = 'none';
            inverterBlock.style.border = 'none';
        }
        // Estado OFF: Solo si Relay 1 Y Relay 2 están apagados Y Relay 3 está OFF
        else if (!relay1State && !relay2State && !relay3State) {
            inverterElement.src = 'images/Inverter_OFF.png';
            inverterStatus.textContent = 'OFF';
            inverterElement.classList.add('off');
            inverterElement.classList.remove('on', 'fault');
            inverterBlock.classList.add('off');
            inverterBlock.classList.remove('on', 'fault');
            // Quitar margen en estado OFF normal
            inverterElement.style.border = 'none';
            inverterBlock.style.border = 'none';
        }
    },
    //esta es la función principal de control de los relay via Web
    async updateRelayState(relayNum, isOn) {
        const newState = isOn ? 'on' : 'off';
        const currentState = this.relayStates[relayNum];
        
        // Skip if state isn't changing
        if (currentState === newState) return;
        
        this.relayStates[relayNum] = newState;
        const config = relayConfig.relays[relayNum];
        
        if (config) {
            try {
                // Update the visual state
                updateRelayVisual(config.elementId, newState);
                
                // Update inverter state based on Relay 3 state
                this.updateInverterState();
                
                // Save the new relay state to cache
                this.saveRelayStatesToCache();
                
            } catch (error) {
                console.error(`Error in updateRelayState for relay ${relayNum}:`, error);
            }
        }
    },
    //Comunicación Bidireccional: Permite que el sistema reaccione a cambios de estado que ocurran directamente en el relé.
    //Esencial para garantizar que cualquier cambio en el estado físico de los relés se refleje correctamente en la interfaz de usuario del sistema SCADA.    
    handleMessage(parsed) {
        try {
            if (parsed.relay1 !== undefined && parsed.relay2 !== undefined && parsed.relay3 !== undefined) {
                // Actualizar estados de todos los relays basado en el broadcast del servidor
                this.updateRelayState(1, parsed.relay1 === 'ON');
                this.updateRelayState(2, parsed.relay2 === 'ON');
                this.updateRelayState(3, parsed.relay3 === 'ON');

                // Actualizar estado del inversor inmediatamente
                this.updateInverterState();

                return;
            }
            // mensajes desconocidos se ignoran silenciosamente
        } catch (e) {
            console.warn('Mensaje de relay inválido:', parsed);
        }
    },
    // Envía el comando al backend Node, que valida server-side y lo reenvía
    // al agente-puente (que a su vez le habla al ESP32). Ya no hay socket
    // directo del navegador al ESP32.
    async sendCommand(relayNum, command) {
        try {
            const allowedEmergency = this.checkEmergencyManeuver(relayNum, command);
            if (!allowedEmergency) return false;

            const allowedDisconnection = this.checkDisconnectionManeuver(relayNum, command);
            if (!allowedDisconnection) return false;

            const allowedCommissioning = this.checkCommissioningManeuver(relayNum, command);
            if (!allowedCommissioning) return false;

            const response = await fetch('/api/relay/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ relayNum, action: command })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (data.message && typeof showNotification === 'function') {
                    showNotification(data.message, 'error');
                }
                console.error(`Error al enviar comando al relay ${relayNum}: HTTP ${response.status}`, data.message);
                return false;
            }

            return true;
        } catch (e) {
            console.error(`Error en sendCommand para Relay ${relayNum}:`, e);
            return false;
        }
    },

    // Verifica si el ESP32 está conectado
    isConnected() {
        return this.isConnectedGlobal;
    },
    
    isButtonInCooldown(relayNum) {
        return this.buttonCooldowns[relayNum] === true;
    },
    
    setButtonCooldown(relayNum, inCooldown) {
        this.buttonCooldowns[relayNum] = inCooldown;
        const config = relayConfig.relays[relayNum];
        if (config) {
            updateButtonState(config.elementId, !inCooldown);
        }
    },
    
    // Muestra la notificación de "fault" cuando el Relay 3 pasa de OFF a ON.
    // El temporizador de 320s que antes armaba crear_fault_relay.php ahora
    // corre server-side (ver app/controllers/relay.controller.js).
    checkRelay3State(relayNum, command) {
        try {
            if (relayNum === 3 && command === 'relay_on') {
                const previousState = this.relayStates[3] === 'on';
                if (!previousState && typeof window.InverterFaultProgress === 'function') {
                    window.InverterFaultProgress(true);
                }
            }
            return true;
        } catch (error) {
            console.error('Error en checkRelay3State:', error);
            return true; // En caso de error, permitir la operación
        }
    },
    
    // Cambiar estado del relay
    async toggleRelay(relayNum) {
        // Verificar si el botón está en cooldown
        if (this.isButtonInCooldown(relayNum)) {
            return;
        }
        
        // Verificar si el ESP32 está conectado
        if (!this.isConnected()) {
            return;
        }
        
        // Obtener el estado actual del relay
        const currentState = this.relayStates[relayNum] === 'on';
        const newState = !currentState;
        const command = newState ? 'relay_on' : 'relay_off';

        // Verificar estado del Relay 3
        const relay3Check = this.checkRelay3State(relayNum, command);
        if (!relay3Check) {
            return;
        }

        // Verificación inmediata de maniobra de emergencia y de habilitación del inversor (bloqueo previo a cooldown/envío)
        const allowedEmergency = this.checkEmergencyManeuver(relayNum, command);
        if (!allowedEmergency) {
            return;
        }
        
        // Verificar maniobra de desconexión (Modo Caracterización)
        const allowedDisconnection = this.checkDisconnectionManeuver(relayNum, command);
        if (!allowedDisconnection) {
            return;
        }
        
        const allowedCommissioning = this.checkCommissioningManeuver(relayNum, command);
        if (!allowedCommissioning) {
            return;
        }
        
        // console.log(`Solicitando cambio de estado del relay ${relayNum} a ${newState ? 'ON' : 'OFF'}`);
        
        // Poner el botón en cooldown
        this.setButtonCooldown(relayNum, true);
        
        // Solo enviamos el comando, NO actualizamos el estado visual todavía
        const commandSent = await this.sendCommand(relayNum, command);

        if (!commandSent) {
            console.error(`No se pudo enviar el comando al relay ${relayNum}`);
            this.setButtonCooldown(relayNum, false); // Revertir cooldown en caso de error
            
            
            return;
        }
        
        // console.log(`Comando ${command} enviado exitosamente al relay ${relayNum}`);
        
        
        // Programar el fin del cooldown (el estado real llega solo, por WS, cuando el ESP32 lo confirme)
        setTimeout(() => {
            this.setButtonCooldown(relayNum, false);
        }, BUTTON_COOLDOWN_MS);
    },
    
    // Nuevo método: Guardar estados de relay en caché
    saveRelayStatesToCache() {
        const states = {
            esp8266Top: this.relayStates[1] === 'on',
            esp8266Bottom: this.relayStates[2] === 'on',
            esp8266Right: this.relayStates[3] === 'on'
        };
        localStorage.setItem('scadaDeviceStates', JSON.stringify(states));
        console.log('Estados de relay guardados en caché:', states);
    },
    
    // Nuevo método: Restaurar estados de relay desde caché
    restoreRelayStatesFromCache() {
        try {
            const states = JSON.parse(localStorage.getItem('scadaDeviceStates') || '{}');
            
            // Restaurar estados solo si existen en caché
            if (states.esp8266Top !== undefined) {
                this.relayStates[1] = states.esp8266Top ? 'on' : 'off';
                updateRelayVisual('esp8266-top', this.relayStates[1]);
            }
            if (states.esp8266Bottom !== undefined) {
                this.relayStates[2] = states.esp8266Bottom ? 'on' : 'off';
                updateRelayVisual('esp8266-bottom', this.relayStates[2]);
            }
            if (states.esp8266Right !== undefined) {
                this.relayStates[3] = states.esp8266Right ? 'on' : 'off';
                updateRelayVisual('esp8266-right', this.relayStates[3]);
            }
            
            // Actualizar estado del inversor basado en los estados restaurados
            this.updateInverterState();
            
            console.log('Estados de relay restaurados desde caché:', this.relayStates);
        } catch (error) {
            console.error('Error restaurando estados desde caché:', error);
        }
    }
};

// Inicializar el gestor de relays
relayManager.init();


// Restaurar estados al cargar la página
// relayManager.restoreRelayStatesFromCache(); // Ya se llama en init()
    
});

const logoutIcon = document.getElementById("logout-icon");
if (logoutIcon) {
    logoutIcon.addEventListener("click", () => {
    document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.location.href = "/";
    });
}

// Notificación reutilizable
function showNotification(message, type = 'info') {
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