<?php
// app/api/exportar_datos_dashboard.php
// Exporta a Excel los datos del dashboard para un rango de fechas.
//
// La base temporal es datos_irradiancia: una fila por cada lectura del sensor,
// sin promediar ni agrupar. A cada lectura se le asigna el registro de
// datos_inversor más cercano en el tiempo, siempre que esté a no más de
// TOLERANCIA_INVERSOR_SEGUNDOS; si no hay ninguno (GoodWeReader apagado, sin
// red, etc.), las columnas del inversor quedan vacías en vez de mostrar datos
// de otro momento como si fueran de esa hora.
//
// Solo salen datos promediados (lo que GoodWeReader guarda cada minuto): los
// datos instantáneos que se muestran al maniobrar relés nunca llegan a la base.
//
// Si el rango no tiene lecturas, se entregan las más cercanas antes y después
// del rango (archivo "datos_dashboard_cercanos_..."), para que el usuario no
// se quede con las manos vacías al elegir un período sin mediciones.

require __DIR__ . '/../../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

const TOLERANCIA_INVERSOR_SEGUNDOS = 60;

const COLUMNAS_INVERSOR = [
    'Vpv1', 'Vpv2', 'Ipv1', 'Ipv2',
    'Vac1', 'Vac2', 'Vac3',
    'Iac1', 'Iac2', 'Iac3',
    'Fac1', 'Fac2', 'Fac3',
    'Pac', 'EnergyToday',
];

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function responderJson(int $codigo, string $mensaje, ?string $debug = null): void
{
    http_response_code($codigo);
    echo json_encode(['success' => false, 'message' => $mensaje, 'debug' => $debug]);
    exit();
}

function conectar(): PDO
{
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../../');
    $dotenv->safeLoad();

    $host = $_ENV['DB_HOST'] ?? 'localhost';
    $dbname = $_ENV['DB_NAME'] ?? 'labvirtual';
    $user = $_ENV['DB_USER'] ?? 'root';
    $pass = $_ENV['DB_PASSWORD'] ?? '';

    return new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

function obtenerSensorEnRango(PDO $pdo, string $start, string $end): array
{
    $stmt = $pdo->prepare("
        SELECT fecha_hora, temperatura, irradiancia
        FROM datos_irradiancia
        WHERE fecha_hora BETWEEN :start AND :end
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':start' => $start, ':end' => $end]);
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
// ambos lados para poder emparejar las lecturas de los bordes.
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

function enviarExcel(array $filas, string $prefijoArchivo): void
{
    $encabezados = array_merge(['fecha_hora'], COLUMNAS_INVERSOR, ['temperatura', 'irradiancia']);
    $matriz = [$encabezados];
    foreach ($filas as $fila) {
        $matriz[] = array_map(
            fn($columna) => ($columna === 'fecha_hora' || $fila[$columna] === null)
                ? $fila[$columna]
                : round((float) $fila[$columna], 2),
            $encabezados
        );
    }

    $spreadsheet = new Spreadsheet();
    // null = celda vacía (inversor sin registro dentro de la tolerancia)
    $spreadsheet->getActiveSheet()->fromArray($matriz, null, 'A1');

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment;filename="' . $prefijoArchivo . date('Y-m-d_His') . '.xlsx"');
    header('Cache-Control: max-age=0');
    (new Xlsx($spreadsheet))->save('php://output');
    exit();
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $start = $input['start'] ?? $_GET['start'] ?? null;
    $end = $input['end'] ?? $_GET['end'] ?? null;

    if (!$start || !$end) {
        responderJson(400, 'Faltan parámetros de fecha.');
    }

    ini_set('memory_limit', '512M');
    set_time_limit(300);

    $pdo = conectar();

    $sensor = obtenerSensorEnRango($pdo, $start, $end);
    if (!empty($sensor)) {
        $inversor = obtenerInversorAlrededor($pdo, $sensor[0]['fecha_hora'], end($sensor)['fecha_hora']);
        enviarExcel(alinearConInversor($sensor, $inversor), 'datos_dashboard_');
    }

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
    enviarExcel(alinearConInversor($sensor, $inversor), 'datos_dashboard_cercanos_');
} catch (\Throwable $e) {
    error_log('exportar_datos_dashboard.php: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    $debug = ($_ENV['APP_DEBUG'] ?? '') === 'true' ? $e->getMessage() : null;
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    responderJson(500, 'Error al exportar los datos del dashboard. Por favor, intente nuevamente.', $debug);
}
