<?php
// app/api/exportar_datos_tabla.php
// Exporta a Excel una sola tabla para un rango de fechas, tal cual está en la
// base (una fila por registro, con su propia fecha_hora, sin emparejar):
//   tipo = 'potencia'    -> datos_inversor
//   tipo = 'irradiancia' -> datos_irradiancia
// La exportación combinada de ambas tablas la hace exportar_datos_dashboard.php.
//
// Desde 2026-11-25: por meses y en streaming (una hoja "AAAA-MM" por mes, RAM acotada
// a un mes de datos). Detalle en app/includes/exportar_excel.php.

require_once __DIR__ . '/../includes/exportar_excel.php';

// Las columnas salen de esta lista fija (nunca del request), así que es seguro
// interpolarlas en el SQL.
const TABLAS = [
    'potencia' => [
        'tabla' => 'datos_inversor',
        'columnas' => [
            'Vpv1', 'Vpv2', 'Ipv1', 'Ipv2',
            'Vac1', 'Vac2', 'Vac3',
            'Iac1', 'Iac2', 'Iac3',
            'Fac1', 'Fac2', 'Fac3',
            'Pac', 'EnergyToday', 'EnergyTotal',
        ],
        'prefijo' => 'datos_potencia_',
    ],
    'irradiancia' => [
        'tabla' => 'datos_irradiancia',
        'columnas' => ['temperatura', 'irradiancia'],
        'prefijo' => 'datos_irradiancia_',
    ],
];

prepararEndpoint();

function obtenerEnRango(PDO $pdo, array $config, string $desde, string $hasta): array
{
    $columnas = implode(', ', $config['columnas']);
    $stmt = $pdo->prepare("
        SELECT fecha_hora, $columnas
        FROM {$config['tabla']}
        WHERE fecha_hora BETWEEN :desde AND :hasta
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':desde' => $desde, ':hasta' => $hasta]);
    return $stmt->fetchAll();
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $tipo = $input['tipo'] ?? $_GET['tipo'] ?? null;
    if (!isset(TABLAS[$tipo])) {
        responderJson(400, 'Tipo de datos inválido.');
    }
    [$inicio, $fin] = leerRango($input);
    $config = TABLAS[$tipo];
    $pdo = conectar();

    $tramos = mesesDelRango($inicio, $fin);
    if (empty($tramos) || !hayDatos($pdo, $config['tabla'], $tramos[0]['desde'], end($tramos)['hasta'])) {
        // 200 sin Excel: exportar.js lo interpreta como "sin datos", no como error
        responderJson(200, 'No existen datos en el intervalo seleccionado.');
    }

    $excel = new ExcelPorMeses(
        array_merge(['fecha_hora'], $config['columnas']),
        $config['prefijo'] . date('Y-m-d_His') . '.xlsx'
    );
    foreach ($tramos as $tramo) {
        $filas = obtenerEnRango($pdo, $config, $tramo['desde'], $tramo['hasta']);
        if (empty($filas)) {
            continue; // meses sin datos no generan hoja vacía
        }
        $excel->nuevaHoja($tramo['etiqueta']);
        foreach ($filas as $fila) {
            $excel->agregarFila($fila);
        }
        unset($filas);
    }
    $excel->cerrar();
} catch (\Throwable $e) {
    fallarExportacion($e, 'exportar_datos_tabla.php', 'Error al exportar los datos. Por favor, intente nuevamente.');
}
