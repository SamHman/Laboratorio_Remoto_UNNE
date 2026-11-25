<?php
// app/api/exportar_datos_dashboard.php
// Exporta a Excel los datos del dashboard para un rango de fechas.
//
// La base temporal es datos_irradiancia: una fila por cada lectura del sensor,
// sin promediar ni agrupar. A cada lectura se le asigna el registro de
// datos_inversor más cercano en el tiempo, siempre que esté a no más de
// TOLERANCIA_INVERSOR_SEGUNDOS; si no hay ninguno (GoodWeReader apagado, sin
// red, etc.), las columnas del inversor no toman datos de otro momento como si
// fueran de esa hora (salen en 0, igual que antes).
//
// Solo salen datos promediados (lo que GoodWeReader guarda cada minuto): los
// datos instantáneos que se muestran al maniobrar relés nunca llegan a la base.
//
// Si el rango no tiene lecturas, se entregan las más cercanas antes y después
// del rango (archivo "datos_dashboard_cercanos_..."), para que el usuario no
// se quede con las manos vacías al elegir un período sin mediciones.
//
// Desde 2026-11-25: por meses y en streaming (una hoja "AAAA-MM" por mes, RAM acotada
// a un mes de datos). Detalle en app/includes/exportar_excel.php.

require_once __DIR__ . '/../includes/exportar_excel.php';

const TOLERANCIA_INVERSOR_SEGUNDOS = 60;

const COLUMNAS_INVERSOR = [
    'Vpv1', 'Vpv2', 'Ipv1', 'Ipv2',
    'Vac1', 'Vac2', 'Vac3',
    'Iac1', 'Iac2', 'Iac3',
    'Fac1', 'Fac2', 'Fac3',
    'Pac', 'EnergyToday',
];

const ENCABEZADOS_DASHBOARD = [
    'fecha_hora',
    ...COLUMNAS_INVERSOR,
    'temperatura', 'irradiancia',
];

prepararEndpoint();

function obtenerSensorEnRango(PDO $pdo, string $desde, string $hasta): array
{
    $stmt = $pdo->prepare("
        SELECT fecha_hora, temperatura, irradiancia
        FROM datos_irradiancia
        WHERE fecha_hora BETWEEN :desde AND :hasta
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':desde' => $desde, ':hasta' => $hasta]);
    return $stmt->fetchAll();
}

// Lectura más cercana antes del rango y más cercana después (0, 1 o 2 filas)
function obtenerSensorCercano(PDO $pdo, string $start, string $end): array
{
    $stmt = $pdo->prepare("
        (SELECT fecha_hora, temperatura, irradiancia
         FROM datos_irradiancia
         WHERE fecha_hora <= :start
         ORDER BY fecha_hora DESC LIMIT 1)
        UNION ALL
        (SELECT fecha_hora, temperatura, irradiancia
         FROM datos_irradiancia
         WHERE fecha_hora >= :end
         ORDER BY fecha_hora ASC LIMIT 1)
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll();
}

// Registros del inversor entre $desde y $hasta, ampliado en la tolerancia hacia
// ambos lados para poder emparejar las lecturas de los bordes (también en el
// borde entre dos meses).
function obtenerInversorAlrededor(PDO $pdo, string $desde, string $hasta): array
{
    $columnas = implode(', ', COLUMNAS_INVERSOR);
    $tolerancia = TOLERANCIA_INVERSOR_SEGUNDOS;
    $stmt = $pdo->prepare("
        SELECT fecha_hora, $columnas
        FROM datos_inversor
        WHERE fecha_hora BETWEEN DATE_SUB(:desde, INTERVAL $tolerancia SECOND)
                             AND DATE_ADD(:hasta, INTERVAL $tolerancia SECOND)
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':desde' => $desde, ':hasta' => $hasta]);
    return $stmt->fetchAll();
}

// Ambos arrays vienen ordenados de más viejo a más nuevo, así que el registro
// del inversor más cercano a cada lectura del sensor solo puede avanzar: se
// recorren los dos a la vez en una sola pasada.
function alinearConInversor(array $sensor, array $inversor): array
{
    $tiemposInversor = array_map(fn($r) => strtotime($r['fecha_hora']), $inversor);
    $n = count($inversor);
    $j = 0;
    $filas = [];

    foreach ($sensor as $lectura) {
        $t = strtotime($lectura['fecha_hora']);
        while ($j + 1 < $n && abs($tiemposInversor[$j + 1] - $t) <= abs($tiemposInversor[$j] - $t)) {
            $j++;
        }
        $registro = ($n > 0 && abs($tiemposInversor[$j] - $t) <= TOLERANCIA_INVERSOR_SEGUNDOS)
            ? $inversor[$j]
            : null;

        $fila = ['fecha_hora' => $lectura['fecha_hora']];
        foreach (COLUMNAS_INVERSOR as $columna) {
            $fila[$columna] = $registro[$columna] ?? null;
        }
        $fila['temperatura'] = $lectura['temperatura'];
        $fila['irradiancia'] = $lectura['irradiancia'];
        $filas[] = $fila;
    }
    return $filas;
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    [$inicio, $fin] = leerRango($input);
    $pdo = conectar();
    $tramos = mesesDelRango($inicio, $fin);

    if (!empty($tramos) && hayDatos($pdo, 'datos_irradiancia', $tramos[0]['desde'], end($tramos)['hasta'])) {
        $excel = new ExcelPorMeses(ENCABEZADOS_DASHBOARD, 'datos_dashboard_' . date('Y-m-d_His') . '.xlsx');
        foreach ($tramos as $tramo) {
            $sensor = obtenerSensorEnRango($pdo, $tramo['desde'], $tramo['hasta']);
            if (empty($sensor)) {
                continue; // meses sin datos no generan hoja vacía
            }
            $inversor = obtenerInversorAlrededor($pdo, $sensor[0]['fecha_hora'], end($sensor)['fecha_hora']);
            $excel->nuevaHoja($tramo['etiqueta']);
            foreach (alinearConInversor($sensor, $inversor) as $fila) {
                $excel->agregarFila($fila);
            }
            unset($sensor, $inversor);
        }
        $excel->cerrar();
    }

    $start = $inicio->format('Y-m-d H:i:s');
    $end = $fin->format('Y-m-d H:i:s');
    $sensor = obtenerSensorCercano($pdo, $start, $end);
    if (empty($sensor)) {
        // 200 sin Excel: exportar.js lo interpreta como "sin datos", no como error
        responderJson(200, 'No existen datos en el intervalo seleccionado.');
    }

    // Las lecturas cercanas pueden estar a días de distancia entre sí: se busca
    // el inversor alrededor de cada una por separado, no en todo el intervalo.
    $inversor = [];
    foreach ($sensor as $lectura) {
        $inversor = array_merge($inversor, obtenerInversorAlrededor($pdo, $lectura['fecha_hora'], $lectura['fecha_hora']));
    }
    $excel = new ExcelPorMeses(ENCABEZADOS_DASHBOARD, 'datos_dashboard_cercanos_' . date('Y-m-d_His') . '.xlsx');
    $excel->nuevaHoja('Cercanos');
    foreach (alinearConInversor($sensor, $inversor) as $fila) {
        $excel->agregarFila($fila);
    }
    $excel->cerrar();
} catch (\Throwable $e) {
    fallarExportacion($e, 'exportar_datos_dashboard.php', 'Error al exportar los datos del dashboard. Por favor, intente nuevamente.');
}
