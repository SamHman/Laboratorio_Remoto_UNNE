<?php
// app/api/exportar_datos_tabla.php
// Exporta a Excel una sola tabla para un rango de fechas, tal cual está en la
// base (una fila por registro, con su propia fecha_hora, sin emparejar):
//   tipo = 'potencia'    -> datos_inversor
//   tipo = 'irradiancia' -> datos_irradiancia
// La exportación combinada de ambas tablas la hace exportar_datos_dashboard.php.

require __DIR__ . '/../../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

// Excel admite 1.048.576 filas por hoja (encabezado incluido): se parte en varias hojas
const FILAS_POR_HOJA = 1000000;

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

function obtenerEnRango(PDO $pdo, array $config, string $start, string $end): array
{
    $columnas = implode(', ', $config['columnas']);
    $stmt = $pdo->prepare("
        SELECT fecha_hora, $columnas
        FROM {$config['tabla']}
        WHERE fecha_hora BETWEEN :start AND :end
        ORDER BY fecha_hora ASC
    ");
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll();
}

function enviarExcel(array $filas, array $config): void
{
    $encabezados = array_merge(['fecha_hora'], $config['columnas']);
    $spreadsheet = new Spreadsheet();

    foreach (array_chunk($filas, FILAS_POR_HOJA) as $i => $bloque) {
        $hoja = $i === 0 ? $spreadsheet->getActiveSheet() : $spreadsheet->createSheet();
        $hoja->setTitle('Datos ' . ($i + 1));

        $matriz = [$encabezados];
        foreach ($bloque as $fila) {
            $matriz[] = array_map(
                fn($columna) => $columna === 'fecha_hora'
                    ? $fila[$columna]
                    : ($fila[$columna] === null ? 0 : round((float) $fila[$columna], 2)),
                $encabezados
            );
        }
        // Estricto: con == PhpSpreadsheet trata 0 como null y deja la celda vacía
        $hoja->fromArray($matriz, null, 'A1', true);
        unset($matriz);
    }
    unset($filas);

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment;filename="' . $config['prefijo'] . date('Y-m-d_His') . '.xlsx"');
    header('Cache-Control: max-age=0');
    (new Xlsx($spreadsheet))->save('php://output');
    exit();
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $tipo = $input['tipo'] ?? $_GET['tipo'] ?? null;
    $start = $input['start'] ?? $_GET['start'] ?? null;
    $end = $input['end'] ?? $_GET['end'] ?? null;

    if (!isset(TABLAS[$tipo])) {
        responderJson(400, 'Tipo de datos inválido.');
    }
    if (!$start || !$end) {
        responderJson(400, 'Faltan parámetros de fecha.');
    }

    // Rangos de años (millones de filas): ver también proxy_read_timeout de nginx para /app/api/
    ini_set('memory_limit', '4096M');
    set_time_limit(1800);

    $config = TABLAS[$tipo];
    $filas = obtenerEnRango(conectar(), $config, $start, $end);
    if (empty($filas)) {
        // 200 sin Excel: exportar.js lo interpreta como "sin datos", no como error
        responderJson(200, 'No existen datos en el intervalo seleccionado.');
    }
    enviarExcel($filas, $config);
} catch (\Throwable $e) {
    error_log('exportar_datos_tabla.php: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    $debug = ($_ENV['APP_DEBUG'] ?? '') === 'true' ? $e->getMessage() : null;
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    responderJson(500, 'Error al exportar los datos. Por favor, intente nuevamente.', $debug);
}
